import { clearProviderKey, providerSessionStatus, writeProviderKey } from "@/lib/session";
import { getProvider, type ProviderId } from "@/lib/providers";
import { validateKey } from "@/lib/groq";
export const runtime="nodejs";export const dynamic="force-dynamic";
export function serializeSessionStatus(configured:Record<ProviderId,boolean>){return {configured:configured.groq,providers:configured};}
export async function GET(){return Response.json(serializeSessionStatus(await providerSessionStatus()));}
export async function DELETE(req:Request){const provider=new URL(req.url).searchParams.get("provider") as ProviderId|null;await clearProviderKey(provider??undefined);return Response.json(serializeSessionStatus(await providerSessionStatus()));}
export async function POST(req:Request){const body=await req.json() as {provider?:ProviderId;key?:string;persist?:"session"|"store"};const provider=body.provider??"groq";if(!getProvider(provider))return Response.json({error:"Unknown provider"},{status:400});const key=(body.key??"").trim();if(!key)return Response.json({error:"A provider key is required."},{status:400});try{if(provider==="groq")await validateKey(key);await writeProviderKey(provider,key,body.persist??"session");return Response.json(serializeSessionStatus(await providerSessionStatus()));}catch(error){return Response.json({error:error instanceof Error ? error.message : "Provider validation failed"},{status:400});}}
