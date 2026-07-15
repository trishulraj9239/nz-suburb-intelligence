# Model tradeoff eval (TRI-31)

Claude vs open-weight on 6 fixed suburb questions, scored against the live `/api/ask` pipeline. Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).

| Model | Plan valid | Citations OK | Refusal OK | Avg quality | Avg latency | Est. cost/run |
|---|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 6/6 | 6/6 | 6/6 | 5.0/5 | 4782ms | $0.00131 |
| Qwen 3.6 27B (Groq) | 6/6 | 6/6 | 6/6 | 4.5/5 | 750ms | $0.00002 |
