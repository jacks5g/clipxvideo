import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SectionHeading } from "./section-heading";

const faqs = [
  {
    question: "What is FastXClip?",
    answer:
      "FastXClip is an AI long-to-short video generator. It takes long-form footage — podcasts, webinars, interviews, YouTube videos — and automatically cuts it into short, captioned, vertical clips that are ready to publish.",
  },
  {
    question: "How does the AI pick the best moments?",
    answer:
      "The model transcribes your video, analyses speech patterns, topic shifts, laughter and pacing, then scores each segment for hook strength and retention potential. Every clip ships with its score so you can post the winners first.",
  },
  {
    question: "Which formats and platforms are supported?",
    answer:
      "Upload MP4, MOV, WEBM or paste a YouTube / Zoom link. Exports are available in 9:16, 1:1 and 16:9 up to 4K, and you can push clips directly to TikTok, YouTube Shorts, Instagram Reels and LinkedIn.",
  },
  {
    question: "Do I need any editing experience?",
    answer:
      "None at all. Upload, click generate, and review the results. If you want control, the browser editor lets you trim, adjust captions and swap templates — but you can ship every clip without touching a timeline.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Plans are month-to-month (or annual with a 20% discount) and you can cancel from your dashboard in one click. Your remaining credits stay active until the end of the billing period.",
  },
  {
    question: "Is my content used to train AI models?",
    answer:
      "Never. Your uploads are processed in an isolated pipeline, encrypted at rest, and deleted on request. We do not use customer content to train models, and all plans include GDPR-friendly storage.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions, answered"
          description="Everything you might want to know before your first upload."
        />

        <div className="mx-auto mt-10 max-w-3xl">
          <Accordion defaultValue={["faq-1"]}>
            {faqs.map((faq, index) => (
              <AccordionItem key={faq.question} value={`faq-${index + 1}`}>
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground">{faq.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
