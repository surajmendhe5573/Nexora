import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';

import { PrismaClient } from '../generated/prisma/client.js';

import { config } from './env.js';

const { Pool } = pkg;

const pool = new Pool({ connectionString: config.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export default prisma;
