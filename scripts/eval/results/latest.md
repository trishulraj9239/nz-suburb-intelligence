# Model tradeoff eval (TRI-31)

Claude vs open-weight on 22 fixed suburb questions, scored against the live `/api/ask` pipeline. Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).

| Model | Plan valid | Citations OK | Refusal OK | Avg quality | Avg latency | Est. cost/run |
|---|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 22/22 | 22/22 | 22/22 | 4.1/5 | 7419ms | $0.00229 |
| Qwen 3.6 27B (Groq) | 22/22 | 22/22 | 22/22 | 4.2/5 | 8811ms | $0.00002 |
