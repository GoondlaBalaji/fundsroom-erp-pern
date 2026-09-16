import { createApp } from './app';
import { config } from './config/env';

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`🚀 Fundsroom ERP Backend running on http://localhost:${config.PORT}`);
  console.log(`📡 Environment: ${config.NODE_ENV}`);
});
