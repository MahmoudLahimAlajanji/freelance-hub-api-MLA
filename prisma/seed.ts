import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@freelancehub.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'Admin@12345';
  const name = process.env.ADMIN_NAME ?? 'Platform Admin';

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, password: await bcrypt.hash(password, 10), role: 'ADMIN' },
  });
  // The admin wallet doubles as the platform wallet that receives the 10% commission
  await prisma.wallet.upsert({ where: { userId: admin.id }, update: {}, create: { userId: admin.id } });

  const categories = [
    { name: 'برمجة', slug: 'programming' },
    { name: 'تصميم', slug: 'design' },
    { name: 'ترجمة', slug: 'translation' },
    { name: 'تسويق', slug: 'marketing' },
  ];
  for (const c of categories) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }
  console.log(`Seed done. Admin: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
