import { QuoteGame } from "@/components/QuoteGame";
import { modeMetadata } from "@/lib/site";

export const metadata = modeMetadata({
  slug: "quote",
  title: "Quote",
  description:
    "A pre-match exchange between two Overwatch heroes. Identify both speakers from a single line of voice dialogue. New daily Overwatch quote quiz every day.",
});

export default function QuotePage() {
  return <QuoteGame />;
}
