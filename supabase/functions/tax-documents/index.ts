import { createClient } from 'npm:@supabase/supabase-js@2.99.3';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: cors});
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {headers: cors});
  if (req.method !== 'POST') return response({error:'Method not allowed'},405);
  const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return response({error:'Sign in required'},401);
  const userClient = createClient(url, anon, {global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data:{user},error:authError} = await userClient.auth.getUser(auth.slice(7));
  if (authError || !user) return response({error:'Session expired'},401);
  const admin = createClient(url, service, {auth:{persistSession:false}});
  const {data:member,error:memberError} = await admin.from('tax_members').select('role,active').eq('user_id',user.id).maybeSingle();
  if(memberError || !member?.active || !['admin','officer'].includes(member.role)) return response({error:'Tax officer access required'},403);
  try {
    const body = await req.json();
    if(body.action === 'download') {
      const {data:doc,error} = await admin.from('tax_documents').select('*').eq('id',body.document_id).single();
      if(error || !doc) return response({error:'Document unavailable'},404);
      const {error:auditError} = await userClient.rpc('tax_command',{p_action:'document_access',p_data:{client_id:doc.client_id,document_id:doc.id,reason:body.reason}});
      if(auditError) return response({error:auditError.message},403);
      const {data:signed,error:signError} = await admin.storage.from('tax-private-documents').createSignedUrl(doc.path,60,{download:doc.original_name});
      if(signError) throw signError;
      return response({url:signed!.signedUrl,expires_in:60});
    }
    if(body.action !== 'upload' || !['ntn','certificate'].includes(body.kind)) return response({error:'Invalid document type'},400);
    if(typeof body.base64 !== 'string' || body.base64.length > 13981016 || typeof body.name !== 'string' || !body.name.toLowerCase().endsWith('.pdf')) return response({error:'PDF files up to 10 MB only'},400);
    const bytes = Uint8Array.from(atob(body.base64),c=>c.charCodeAt(0));
    if(bytes.length === 0 || bytes.length>10485760 || new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-') return response({error:'Invalid PDF file'},400);
    const {data:client,error:clientError} = await admin.from('tax_clients').select('id,archived').eq('id',body.client_id).single();
    if(clientError || !client || client.archived) return response({error:'Client unavailable'},404);
    const path = `${client.id}/${body.kind}/${crypto.randomUUID()}.pdf`;
    const {error:uploadError} = await admin.storage.from('tax-private-documents').upload(path,bytes,{contentType:'application/pdf',upsert:false});
    if(uploadError) throw uploadError;
    const {data:id,error:registerError} = await admin.rpc('tax_register_document',{p_actor:user.id,p_client:client.id,p_kind:body.kind,p_path:path,p_name:body.name.slice(0,200),p_size:bytes.length});
    if(registerError) { await admin.storage.from('tax-private-documents').remove([path]); throw registerError; }
    return response({id});
  } catch { return response({error:'Document operation failed. Please retry or contact your administrator.'},400); }
});
