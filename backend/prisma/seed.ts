import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Clean existing records in reverse dependency order
  await prisma.dispatchItem.deleteMany();
  await prisma.dispatch.deleteMany();
  await prisma.salesOrderItem.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.quotationItem.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.enquiryItem.deleteMany();
  await prisma.enquiry.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();

  // 2. Create Users
  const adminPasswordHash = await bcrypt.hash('AdminPassword@123', 10);
  const salesPasswordHash = await bcrypt.hash('SalesPassword@123', 10);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@fundsroom.com',
      password: adminPasswordHash,
      fullName: 'Vikram Mehta (Admin)',
      role: UserRole.ADMIN,
    },
  });

  const salesUser = await prisma.user.create({
    data: {
      email: 'sales@fundsroom.com',
      password: salesPasswordHash,
      fullName: 'Rahul Verma (Sales Executive)',
      role: UserRole.SALES_USER,
    },
  });

  console.log(`✅ Created users: ${adminUser.email} (ADMIN), ${salesUser.email} (SALES_USER)`);

  // 3. Create Industrial Products & Initial Inventory
  const productSeeds = [
    {
      code: 'IND-VLV-001',
      name: 'High-Pressure Ball Valve 2 inch (SS 316)',
      category: 'Valves',
      unit: 'PCS',
      basePrice: 4500.0,
      physicalQuantity: 150,
      reservedQuantity: 0,
    },
    {
      code: 'IND-PMP-002',
      name: 'Industrial Centrifugal Water Pump 5HP',
      category: 'Pumps',
      unit: 'PCS',
      basePrice: 28000.0,
      physicalQuantity: 40,
      reservedQuantity: 0,
    },
    {
      code: 'IND-MOT-003',
      name: 'Three-Phase Induction Motor 10kW 415V',
      category: 'Motors',
      unit: 'PCS',
      basePrice: 35000.0,
      physicalQuantity: 60,
      reservedQuantity: 0,
    },
    {
      code: 'IND-FLG-004',
      name: 'Forged Carbon Steel Flange ANSI Class 150',
      category: 'Flanges',
      unit: 'PCS',
      basePrice: 1250.0,
      physicalQuantity: 300,
      reservedQuantity: 0,
    },
    {
      code: 'IND-PIP-005',
      name: 'Seamless Stainless Steel Pipe 3m Grade 304',
      category: 'Pipes',
      unit: 'MTR',
      basePrice: 3200.0,
      physicalQuantity: 200,
      reservedQuantity: 0,
    },
    {
      code: 'IND-GSK-006',
      name: 'Spiral Wound Metallic Gasket DN50 PN40',
      category: 'Gaskets',
      unit: 'PCS',
      basePrice: 650.0,
      physicalQuantity: 500,
      reservedQuantity: 0,
    },
  ];

  for (const p of productSeeds) {
    const product = await prisma.product.create({
      data: {
        code: p.code,
        name: p.name,
        category: p.category,
        unit: p.unit,
        basePrice: p.basePrice,
        inventory: {
          create: {
            physicalQuantity: p.physicalQuantity,
            reservedQuantity: p.reservedQuantity,
            damagedQuantity: 0,
          },
        },
      },
    });
    console.log(`✅ Product created: ${product.code} - ${product.name} (Stock: ${p.physicalQuantity})`);
  }

  // 4. Create Sample Customers
  const customer1 = await prisma.customer.create({
    data: {
      companyName: 'Apex Heavy Engineering Ltd.',
      contactPerson: 'Rajesh Sharma',
      mobile: '+91 9876543210',
      email: 'rsharma@apexheavy.com',
      city: 'Mumbai',
    },
  });

  const customer2 = await prisma.customer.create({
    data: {
      companyName: 'Bharat Infra Structurals Pvt. Ltd.',
      contactPerson: 'Priya Nair',
      mobile: '+91 9823456781',
      email: 'pnair@bharatinfra.in',
      city: 'Pune',
    },
  });

  const customer3 = await prisma.customer.create({
    data: {
      companyName: 'Titan Process Equipments Corp.',
      contactPerson: 'Amitabh Patel',
      mobile: '+91 9988776655',
      email: 'apatel@titanprocess.com',
      city: 'Vadodara',
    },
  });

  console.log(`✅ Customers created: ${customer1.companyName}, ${customer2.companyName}, ${customer3.companyName}`);
  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
