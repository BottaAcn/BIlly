const cds = require('@sap/cds');
const { runAgent } = require('./lib/agent');

module.exports = class BillyService extends cds.ApplicationService {
  async init() {
    this.on('askBilly', this.onAskBilly);
    return super.init();
  }

  // Wrapper sottile sull'agent loop. Nessun onEvent: l'action deve
  // restituire un risultato unico (vale anche come tool MCP, Fase 7).
  // La variante con i passi intermedi è la rotta SSE in srv/server.js.
  onAskBilly = async (req) => {
    const { question, history } = req.data;
    return await runAgent({ question, history });
  };
};
