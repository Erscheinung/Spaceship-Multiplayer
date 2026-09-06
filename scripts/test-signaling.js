// Local integration-test broker only. Never deployed to Vercel.
import { PeerServer } from 'peer';
const server = PeerServer({ port: 9000, host: '127.0.0.1', path: '/' });
process.on('SIGTERM', () => { server.close(); process.exit(0); });
