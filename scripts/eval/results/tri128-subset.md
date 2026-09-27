# Model tradeoff eval (TRI-31)

Claude vs open-weight on 59 fixed suburb questions, scored against the live `/api/ask` pipeline. Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).

| Model | Plan valid | Citations OK | Figures grounded | Refusal OK | Avg quality | Avg latency | Est. cost/run |
|---|---|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 2/2 | 2/2 | 2/2 | 2/2 | 5.0/5 (2/2 judged) | 6644ms | $0.00192 |
| Qwen 3.6 27B (Groq) | 0/2 | 2/2 | 2/2 | 2/2 | 1.0/5 (2/2 judged) | 278ms | $0.00000 |
