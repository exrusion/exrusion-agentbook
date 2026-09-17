import { NextResponse } from "next/server";
import { listChannels } from "@/lib/queries";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ channels: await listChannels() }); }
