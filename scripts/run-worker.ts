import { drainJobs } from '../lib/jobs';

process.loadEnvFile('.env.local');

console.log('processed:', await drainJobs(240_000));
