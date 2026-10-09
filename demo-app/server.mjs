import { createApp } from './app.mjs';

const port = Number(process.env.PORT ?? 4000);
const bugs = process.env.BUGS !== '0';
createApp({ bugs }).listen(port, () => console.log(`ShopNest demo on http://localhost:${port} (bugs=${bugs})`));
