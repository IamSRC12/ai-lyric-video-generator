import { publicProviderStatus } from "@/lib/providers";
import { providerSessionStatus } from "@/lib/session";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){return Response.json({providers:publicProviderStatus(await providerSessionStatus())});}
