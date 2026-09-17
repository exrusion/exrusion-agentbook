import { NextResponse } from "next/server";
import { getModels, providerFor } from "@/lib/openrouter";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const models = await getModels();
    return NextResponse.json({ models: models.map((model) => ({ id: model.id, name: model.name, provider: providerFor(model.id), contextLength: model.context_length || null, pricing: model.pricing || null, available: true })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Catalogue unavailable", models: [] }, { status: 502 });
  }
}
