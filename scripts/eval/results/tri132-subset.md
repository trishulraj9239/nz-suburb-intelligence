# Model tradeoff eval (TRI-31)

Claude vs open-weight on 53 fixed suburb questions, scored against the live `/api/ask` pipeline. Quality is Claude Opus 4.8 as a blind judge (1-5). Tokens/cost are **estimated** (chars/4 × published rates; Groq free tier ≈ $0).

| Model | Plan valid | Citations OK | Figures grounded | Refusal OK | Avg quality | Avg latency | Est. cost/run |
|---|---|---|---|---|---|---|---|
| Claude Sonnet 4.6 | 7/7 | 7/7 | 7/7 | 7/7 | 4.9/5 (7/7 judged) | 3223ms | $0.00143 |
| Qwen 3.6 27B (Groq) | 0/7 | 7/7 | 7/7 | 7/7 | 1.0/5 (7/7 judged) | 245ms | $0.00000 |
