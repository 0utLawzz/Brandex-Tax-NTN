import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.includes("\n")) break;
}
const config = JSON.parse(input.trim());
const conn = { auth: { persistSession: false, autoRefreshToken: false } };
const clients = {},
  checks = [];
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("PASS " + name);
}
async function rpc(who, action, payload) {
  return clients[who].rpc("tax_command", { p_action: action, p_data: payload });
}
function ok(r) {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
}
for (const role of ["admin", "officer", "billing", "viewer", "outsider"]) {
  const c = createClient(config.url, config.key, conn);
  const r = await c.auth.signInWithPassword({
    email: config.prefix + "-" + role + "@example.invalid",
    password: config.password,
  });
  ok(r);
  clients[role] = c;
}
const anon = createClient(config.url, config.key, conn);
let c, y, p, doc;
await check("anonymous cannot read client records", async () =>
  assert.ok((await anon.from("tax_clients").select("*")).error),
);
await check(
  "unassigned account sees no tax records and cannot write",
  async () => {
    assert.deepEqual(
      ok(await clients.outsider.from("tax_clients").select("*")),
      [],
    );
    assert.ok(
      (
        await rpc("outsider", "client_create", {
          code: "QA-99001",
          name: "Synthetic access test",
        })
      ).error,
    );
  },
);
await check("officer creates normalized permanent Client Code", async () => {
  c = ok(
    await rpc("officer", "client_create", {
      code: "qa 99001",
      name: "SYNTHETIC E2E CLIENT",
      cnic: "0000000000000",
      ntn: "TEST-ONLY",
      labels: ["Salary"],
    }),
  );
  assert.equal(c.code, "QA-99001");
});
await check("normalized duplicate Client Code rejected", async () =>
  assert.ok(
    (
      await rpc("officer", "client_create", {
        code: "Qa99001",
        name: "Duplicate test",
      })
    ).error,
  ),
);
await check(
  "viewer cannot create clients; billing cannot edit clients",
  async () => {
    assert.ok(
      (
        await rpc("viewer", "client_create", {
          code: "QA-99002",
          name: "Blocked",
        })
      ).error,
    );
    assert.ok(
      (
        await rpc("billing", "client_update", {
          client_id: c.id,
          name: "Blocked",
        })
      ).error,
    );
  },
);
await check("year charge and filing status saved separately", async () => {
  y = ok(
    await rpc("officer", "year_save", {
      client_id: c.id,
      tax_year: 2026,
      filing_status: "Due",
      due_date: "2026-10-31",
      service_charge: 5000,
    }),
  );
  assert.equal(y.filing_status, "Due");
  assert.equal(Number(y.service_charge), 5000);
});
const paymentPayload = {
  year_id: y.id,
  amount: 2000,
  paid_on: "2026-10-14",
  method: "Bank",
  reference: "TEST-ONLY",
  idempotency_key: crypto.randomUUID(),
};
await check("billing payment produces permanent receipt snapshot", async () => {
  p = ok(await rpc("billing", "payment", paymentPayload));
  assert.equal(Number(p.amount), 2000);
  assert.equal(p.snapshot.client_code, c.code);
  assert.ok(p.receipt_no);
  assert.equal(
    ok(await clients.officer.from("tax_years").select("*").eq("id", y.id)).at(0)
      .filing_status,
    "Due",
  );
});
await check("retrying same payment does not duplicate it", async () =>
  assert.equal(ok(await rpc("billing", "payment", paymentPayload)).id, p.id),
);
await check(
  "overpayment and reducing charge below receipts rejected",
  async () => {
    assert.ok(
      (
        await rpc("billing", "payment", {
          ...paymentPayload,
          amount: 4000,
          idempotency_key: crypto.randomUUID(),
        })
      ).error,
    );
    assert.ok(
      (
        await rpc("officer", "year_save", {
          client_id: c.id,
          tax_year: 2026,
          filing_status: "Due",
          service_charge: 1000,
        })
      ).error,
    );
  },
);
await check("filed return requires a filed date", async () => {
  assert.ok(
    (
      await rpc("officer", "year_save", {
        client_id: c.id,
        tax_year: 2026,
        filing_status: "Filed",
        service_charge: 5000,
      })
    ).error,
  );
  ok(
    await rpc("officer", "year_save", {
      client_id: c.id,
      tax_year: 2026,
      filing_status: "Filed",
      filed_at: "2026-10-14",
      service_charge: 5000,
    }),
  );
});
await check("notes saved and direct table writes denied", async () => {
  ok(
    await rpc("officer", "note", {
      client_id: c.id,
      body: "Synthetic workflow note",
    }),
  );
  assert.ok(
    (
      await clients.officer
        .from("tax_clients")
        .update({ code: "QA-999" })
        .eq("id", c.id)
    ).error,
  );
});
await check(
  "credentials stored through Vault and billing/viewer reveal blocked",
  async () => {
    ok(
      await rpc("officer", "credential_save", {
        client_id: c.id,
        password: "SYNTHETIC-FBR-PASSWORD",
        pin: "9876",
        verified_at: "2026-10-14",
      }),
    );
    assert.equal(
      ok(await rpc("officer", "credential_meta", { client_id: c.id })).exists,
      true,
    );
    assert.ok(
      (
        await rpc("billing", "credential_reveal", {
          client_id: c.id,
          reason: "Test access restriction",
        })
      ).error,
    );
    assert.ok(
      (
        await rpc("viewer", "credential_reveal", {
          client_id: c.id,
          reason: "Test access restriction",
        })
      ).error,
    );
    assert.ok(
      (
        await rpc("officer", "credential_reveal", {
          client_id: c.id,
          reason: "x",
        })
      ).error,
    );
    assert.equal(
      ok(
        await rpc("officer", "credential_reveal", {
          client_id: c.id,
          reason: "Synthetic reveal test",
        }),
      ).password,
      "SYNTHETIC-FBR-PASSWORD",
    );
  },
);
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
);
await check(
  "officer uploads internal NTN PDF through authenticated endpoint",
  async () => {
    const r = await clients.officer.functions.invoke("tax-documents", {
      body: {
        action: "upload",
        client_id: c.id,
        kind: "ntn",
        name: "SYNTHETIC.pdf",
        base64: pdf.toString("base64"),
      },
    });
    doc = ok(r);
    assert.ok(doc.id);
  },
);
await check("certificate PDF stored separately", async () => {
  ok(
    await clients.officer.functions.invoke("tax-documents", {
      body: {
        action: "upload",
        client_id: c.id,
        kind: "certificate",
        name: "SYNTHETIC-CERTIFICATE.pdf",
        base64: pdf.toString("base64"),
      },
    }),
  );
});
await check(
  "billing and viewer cannot list or retrieve private documents",
  async () => {
    for (const r of ["billing", "viewer"]) {
      assert.deepEqual(
        ok(
          await clients[r]
            .from("tax_documents")
            .select("*")
            .eq("client_id", c.id),
        ),
        [],
      );
      assert.ok(
        (
          await clients[r].functions.invoke("tax-documents", {
            body: {
              action: "download",
              document_id: doc.id,
              reason: "Access control test",
            },
          })
        ).error,
      );
    }
  },
);
await check(
  "document download is signed, short-lived and audited",
  async () => {
    const r = ok(
      await clients.officer.functions.invoke("tax-documents", {
        body: {
          action: "download",
          document_id: doc.id,
          reason: "Synthetic retrieval test",
        },
      }),
    );
    assert.equal(r.expires_in, 60);
    assert.ok(r.url.includes("/object/sign/"));
    const res = await fetch(r.url);
    assert.equal(res.status, 200);
    assert.equal(
      Buffer.from(await res.arrayBuffer()).toString(),
      pdf.toString(),
    );
    const ds = ok(
      await clients.officer
        .from("tax_documents")
        .select("path")
        .eq("id", doc.id),
    )[0];
    const publicRes = await fetch(
      config.url + "/storage/v1/object/public/tax-private-documents/" + ds.path,
    );
    assert.notEqual(publicRes.status, 200);
    assert.ok(
      (
        await clients.officer.storage
          .from("tax-private-documents")
          .download(ds.path)
      ).error,
    );
  },
);
await check("non-PDF upload rejected", async () =>
  assert.ok(
    (
      await clients.officer.functions.invoke("tax-documents", {
        body: {
          action: "upload",
          client_id: c.id,
          kind: "ntn",
          name: "bad.pdf",
          base64: Buffer.from("not pdf").toString("base64"),
        },
      })
    ).error,
  ),
);
await check(
  "audit records contain reveal/download events and no secret values",
  async () => {
    const logs = ok(
      await clients.officer.from("tax_audit").select("*").eq("client_id", c.id),
    );
    assert.ok(logs.some((a) => a.action === "credential_reveal"));
    assert.ok(logs.some((a) => a.action === "document_access"));
    assert.ok(!JSON.stringify(logs).includes("SYNTHETIC-FBR-PASSWORD"));
    assert.ok(!JSON.stringify(logs).includes("9876"));
  },
);
await check(
  "administrator can void payment without deleting receipt",
  async () => {
    assert.ok(
      (
        await rpc("billing", "payment_void", {
          payment_id: p.id,
          reason: "Synthetic cancellation",
        })
      ).error,
    );
    ok(
      await rpc("admin", "payment_void", {
        payment_id: p.id,
        reason: "Synthetic cancellation",
      }),
    );
    assert.equal(
      ok(await clients.admin.from("tax_payments").select("*").eq("id", p.id))[0]
        .voided,
      true,
    );
  },
);
await check(
  "soft archive blocks changes and restore retains history",
  async () => {
    ok(await rpc("officer", "archive", { client_id: c.id, archived: true }));
    assert.ok(
      (
        await rpc("officer", "note", {
          client_id: c.id,
          body: "Blocked while archived",
        })
      ).error,
    );
    ok(await rpc("officer", "archive", { client_id: c.id, archived: false }));
    assert.ok(
      ok(
        await clients.officer
          .from("tax_notes")
          .select("*")
          .eq("client_id", c.id),
      ).length,
    );
  },
);
await check(
  "viewer cannot grant admin privileges or update settings",
  async () => {
    assert.ok(
      (
        await rpc("viewer", "member", {
          user_id: c.id,
          role: "admin",
          active: true,
        })
      ).error,
    );
    assert.ok(
      (await rpc("viewer", "settings", { firm_name: "Blocked" })).error,
    );
  },
);
console.log(JSON.stringify({ passed: checks.length, client_id: c.id, checks }));
for (const c of Object.values(clients)) await c.auth.signOut();
