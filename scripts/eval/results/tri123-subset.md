# Model tradeoff eval (TRI-31)

Claude vs open-weight on 43 fixed suburb questions, scored against the live `/api/ask` pipeline. Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).

| Model | Plan valid | Citations OK | Figures grounded | Refusal OK | Avg quality | Avg latency | Est. cost/run |
|---|---|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 3/3 | 3/3 | 2/3 | 3/3 | 5.0/5 (3/3 judged) | 6217ms | $0.00132 |
| Qwen 3.6 27B (Groq) | 0/3 | 3/3 | 3/3 | 3/3 | 1.0/5 (3/3 judged) | 370ms | $0.00000 |
