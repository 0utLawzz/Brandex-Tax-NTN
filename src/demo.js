// Explicit sample workspace. No real client information and no persistent writes.
const stamp = "2026-10-14T10:00:00Z";
export function makeDemo() {
  const names = [
    "DEMO SALARY CLIENT",
    "DEMO BUSINESS CLIENT",
    "DEMO CONSULTANT",
    "DEMO COMPANY",
    "DEMO RETIRED CLIENT",
    "DEMO NEW CLIENT",
  ];
  const clients = names.map((name, i) => ({
    id: `demo-${i}`,
    code: `X-${881 + i}`,
    name,
    cnic: "",
    ntn: "",
    mobile: "",
    email: "",
    client_type: i === 3 ? "Company" : "Individual",
    fbr_status: i % 3 ? "Active" : "Unknown",
    drive_url: "",
    labels: [i % 2 ? "Business" : "Salary"],
    general_notes: "Sample record for preview only.",
    archived: false,
    created_at: stamp,
    updated_at: stamp,
  }));
  const years = clients.map((c, i) => ({
    id: `year-${i}`,
    client_id: c.id,
    tax_year: 2026,
    filing_status: [
      "Filed",
      "In progress",
      "Documents pending",
      "Filed",
      "Due",
      "On hold",
    ][i],
    service_charge: [5000, 12000, 6500, 18000, 4500, 8000][i],
    due_date: "2026-10-31",
    filed_at: i === 0 || i === 3 ? "2026-10-10" : null,
    filing_reference: "",
    notes: "",
    created_at: stamp,
  }));
  const payments = [0, 1, 3].map((i, j) => ({
    id: `pay-${j}`,
    year_id: years[i].id,
    amount: i === 1 ? 5000 : years[i].service_charge,
    paid_on: "2026-10-12",
    method: "Bank",
    reference: "SAMPLE",
    receipt_no: j + 1,
    voided: false,
    created_at: stamp,
    snapshot: {
      client_code: clients[i].code,
      client_name: clients[i].name,
      tax_year: 2026,
      charge: years[i].service_charge,
      paid_before: 0,
      firm: { firm_name: "BRANDEX", address: "", phone: "" },
    },
  }));
  return {
    clients,
    years,
    payments,
    notes: [],
    labels: [
      { name: "Salary", color: "#7b2639" },
      { name: "Business", color: "#4d7898" },
      { name: "VIP", color: "#b88a42" },
    ],
    settings: { firm_name: "BRANDEX", address: "", phone: "", currency: "PKR" },
    members: [{ user_id: "demo-admin", role: "admin", active: true }],
    audit: [],
    documents: [],
  };
}
