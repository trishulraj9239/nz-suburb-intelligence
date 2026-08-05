

/**
 * TRI-93 — starter questions, seeded from the tested set in
 * docs/nl-test-questions.md (TRI-81). Only questions that have actually been
 * run against the pipeline appear here: a chip is a promise that the product
 * can answer this, so a chip that dead-ends is worse than no chip.
 *
 * Deliberately excluded: "cheapest rent near X". It reads like the perfect
 * starter question and is exactly the one with a known rough edge (TRI-111) —
 * putting it on a chip would advertise the weakest path in the product.
 */

export interface QuestionChip {
  label: string;
  question: string;
}

const STARTERS: Record<string, QuestionChip[]> = {
  renter: [
    { label: "Cheapest rents", question: "Which suburbs have the lowest median weekly rent?" },
    {
      label: "Rent + commute",
      question: "Compare Mount Roskill North East and New Lynn Central South for renting.",
    },
    { label: "Cycle to town", question: "How long would I cycle from Ponsonby West to the CBD?" },
  ],
  buyer: [
    { label: "Where it's being built", question: "Where is the most new housing being consented?" },
    { label: "Room to grow", question: "Which suburbs have the most intensification capacity?" },
    { label: "Flood exposure", question: "How much of Papakura East is in a flood plain?" },
  ],
};

export function starterChips(persona: string): QuestionChip[] {
  return STARTERS[persona] ?? STARTERS.renter;
}

/**
 * Follow-ups offered once an answer exists. Phrased around a suburb the answer
 * actually cited, so the chip can't send the user somewhere the data doesn't
 * go. Returns nothing when there's no suburb to anchor to — an irrelevant
 * follow-up is worse than none.
 */
export function followUpChips(persona: string, suburb: string | null): QuestionChip[] {
  if (!suburb) return [];
  return persona === "buyer"
    ? [
        { label: "What's being built there", question: `How much is being built in ${suburb}?` },
        { label: "Hazard layers", question: `How much of ${suburb} is in a flood plain?` },
        { label: "Deprivation", question: `What is the NZDep deprivation decile for ${suburb}?` },
      ]
    : [
        { label: "Rent trend", question: `What is the rent in ${suburb} and how has it moved?` },
        { label: "Getting around", question: `How long is the drive from ${suburb} to the CBD?` },
        { label: "Schools nearby", question: `What schools are near ${suburb}?` },
      ];
}
