# Contrato de API: Monitoramento da Qualidade do Ar

Fonte da verdade entre backend e frontend. Se precisar mudar algo aqui, atualize este arquivo primeiro.

## Fonte de dados (ThingSpeak)
- Channel ID: 3577130
- Endpoint: https://api.thingspeak.com/channels/3577130/feeds.json?api_key=<READ_KEY>&results=30
- O ESP32 envia dados a cada 20 s.

## Campos do ThingSpeak
| Campo  | Significado               | Unidade       |
|--------|---------------------------|---------------|
| field1 | eCO2 (SGP30)              | ppm           |
| field2 | TVOC (SGP30)              | ppb           |
| field3 | Variação do MQ135 (delta) | V             |
| field4 | Alerta                    | 0 normal, 1 alerta |
| field5 | Nível geral               | 0 a 2         |

## Níveis de qualidade (field5)
Os 3 níveis correspondem aos 3 LEDs do circuito.

| Nível | Nome     | Cor      | LED do firmware |
|-------|----------|----------|-----------------|
| 0     | BOA      | verde    | verde           |
| 1     | MODERADA | amarelo  | amarelo         |
| 2     | RUIM     | vermelho | vermelho        |

Regra de alerta: `alerta == 1` ou `nivel >= 1`. O firmware envia `alerta = 1` sempre que o nível é MODERADA ou RUIM; a gravidade define a cor do alerta (amarelo para MODERADA, vermelho para RUIM).

## API do backend (proxy)
`GET /api/readings` retorna:

```json
{
  "updatedAt": "2026-11-17T17:00:00.000Z",
  "cached": false,
  "latest": {
    "timestamp": "2026-11-17T16:59:40Z",
    "eco2": 450,
    "tvoc": 12,
    "mq135": 0.041,
    "alerta": 0,
    "nivel": 0,
    "nivelNome": "BOA"
  },
  "history": [
    { "timestamp": "...", "eco2": 450, "tvoc": 12, "mq135": 0.041, "alerta": 0, "nivel": 0, "nivelNome": "BOA" }
  ]
}
```

- `history` traz até 30 leituras, da mais antiga para a mais recente.
- Campos nulos no ThingSpeak viram `null`.
- Em erro do ThingSpeak: HTTP 502 com `{ "error": "mensagem" }`.
- CORS liberado para o frontend. Cache de 20 s.
- Porta padrão: 3000 (variável `PORT`).

## Fallback do frontend
Se `/api/readings` não estiver disponível, o frontend pode consumir o ThingSpeak direto, normalizando os dados para o mesmo formato acima. A URL base deve ficar em uma constante no topo do `app.js`.