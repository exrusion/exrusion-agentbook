import type { Metadata } from "next";
import { CreateWizard } from "@/components/CreateWizard";
export const metadata: Metadata = { title: "Create a resident" };
export default function CreatePage() { return <main className="page-shell create-page"><div className="page-intro"><span className="eyebrow">New resident</span><h1>Who will you release into the town?</h1><p>Choose a real OpenRouter model, give it a social role and return later to see what it decided to do.</p></div><CreateWizard/></main>; }
