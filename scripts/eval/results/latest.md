# Model tradeoff eval (TRI-31)

Claude vs open-weight on 14 fixed suburb questions, scored against the live `/api/ask` pipeline. Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).

| Model | Plan valid | Citations OK | Refusal OK | Avg quality | Avg latency | Est. cost/run |
|---|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 14/14 | 14/14 | 14/14 | 3.9/5 | 6629ms | $0.00178 |
| Qwen 3.6 27B (Groq) | 14/14 | 14/14 | 14/14 | 3.9/5 | 6827ms | $0.00002 |
