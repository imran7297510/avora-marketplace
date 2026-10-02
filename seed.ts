
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const SEED_USER_ID = "official-marketplace-store";

async function seedUser() {
  console.log("Seeding user profile...");
  await setDoc(doc(db, 'users', SEED_USER_ID), {
    id: SEED_USER_ID,
    name: "Official Marketplace Store",
    email: "store@treasurehub.pk",
    isVerified: true,
    isPremiumVerified: true,
    trustRanking: 98,
    sellerScore: 4.9,
    photoURL: "https://images.unsplash.com/photo-1472851294608-062f824d5868?w=200&h=200&fit=crop",
    city: "Lahore",
    referralCode: "OFFICIAL123",
    referralCount: 150,
    createdAt: serverTimestamp()
  });
}

const sampleListings = [
  // ELECTRONICS
  {
    title: "iPhone 15 Pro Max - 256GB Titanium",
    category: "Electronics",
    subcategory: "Mobile Phones",
    price: 345000,
    description: "Brand new sealed pack iPhone 15 Pro Max. Natural Titanium color. 1 year Apple warranty.",
    images: ["https://images.unsplash.com/photo-1696446701796-da61225697cc?w=800&q=80"]
  },
  {
    title: "Samsung S24 Ultra - Phantom Black",
    category: "Electronics",
    subcategory: "Mobile Phones",
    price: 385000,
    description: "Mint condition Samsung Galaxy S24 Ultra. 12GB RAM, 512GB Storage. With original box.",
    images: ["https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=800&q=80"]
  },
  {
    title: "MacBook Pro M3 Max 14-inch",
    category: "Electronics",
    subcategory: "Laptops",
    price: 850000,
    description: "Apple MacBook Pro with M3 Max chip. 36GB RAM, 1TB SSD. Space Black. Only 5 charge cycles.",
    images: ["https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80"]
  },
  {
    title: "Sony PlayStation 5 Slim Edition",
    category: "Electronics",
    subcategory: "Gaming Consoles",
    price: 155000,
    description: "PS5 Slim with 2 DualSense controllers. Includes 3 games: Spider-Man 2, God of War Ragnarok, and FC24.",
    images: ["https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=800&q=80"]
  },
  {
    title: "Canon EOS R6 Mark II Mirrorless",
    category: "Electronics",
    subcategory: "Cameras",
    price: 645000,
    description: "Professional mirrorless camera with 24.2MP full-frame sensor. Included 24-105mm kit lens.",
    images: ["https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80"]
  },

  // VEHICLES
  {
     title: "Honda Civic RS Turbo 2024",
     category: "Vehicles",
     subcategory: "Cars",
     price: 9800000,
     description: "Model 2024, Zero meter, White color. Full options with sunroof and leather interior.",
     images: ["https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80"]
  },
  {
     title: "Toyota Fortuner Legender 2023",
     category: "Vehicles",
     subcategory: "Cars",
     price: 18500000,
     description: "Pearl White, First owner, 15000km driven. Just like new. Detailed professionally.",
     images: ["https://images.unsplash.com/photo-1532581133568-154f67645168?w=800&q=80"]
  },
  {
     title: "Yamaha YBR 125G - Stealth Blue",
     category: "Vehicles",
     subcategory: "Motorcycles",
     price: 435000,
     description: "Brand new condition YBR 125G. Only 2000km driven. Registered in 2024.",
     images: ["https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=800&q=80"]
  },
  {
     title: "Heavy Bike Kawasaki Ninja H2",
     category: "Vehicles",
     subcategory: "Motorcycles",
     price: 12500000,
     description: "Collectors piece. 2022 model, very low mileage. All accessories included.",
     images: ["https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=800&q=80"]
  },
  {
     title: "Suzuki Vitara GLX 2018",
     category: "Vehicles",
     subcategory: "Cars",
     price: 5500000,
     description: "Well maintained Japanese Vitara. Panoramic sunroof, 4WD. Family used car.",
     images: ["https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&q=80"]
  },

  // PROPERTY
  {
    title: "10 Marla Modern Villa - DHA Phase 6",
    category: "Property",
    subcategory: "Houses for Sale",
    price: 65000000,
    description: "Luxurious 5 bedroom house with Italian kitchen, Spanish tiles, and state-of-the-art security.",
    images: ["https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80"]
  },
  {
    title: "Luxury Apartment - Bahria Town",
    category: "Property",
    subcategory: "Apartments",
    price: 18000000,
    description: "2 bedroom fully furnished apartment with park view. Gym and swimming pool facilities available.",
    images: ["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80"]
  },
  {
    title: "5 Marla Residential Plot - State Life",
    category: "Property",
    subcategory: "Plots",
    price: 8500000,
    description: "Prime location plot near main boulevard. All dues cleared. Ready for construction.",
    images: ["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80"]
  },
  {
    title: "Furnished Office Space - Gulberg",
    category: "Property",
    subcategory: "Offices",
    price: 125000,
    description: "Modern office setup in the heart of Gulberg. Includes high-speed internet and meeting rooms.",
    images: ["https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80"]
  },
  {
    title: "Agricultural Land - 100 Acres",
    category: "Property",
    subcategory: "Agricultural Land",
    price: 250000000,
    description: "Fertile land ideal for corporate farming. Includes direct water access and farm buildings.",
    images: ["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80"]
  },

  // FASHION & BEAUTY
  {
    title: "Designer Bridal Jora - HSY Collection",
    category: "Fashion & Beauty",
    subcategory: "Women Clothing",
    price: 450000,
    description: "Exquisite hand-embroidered bridal dress. Worn once for 3 hours. Mint condition.",
    images: ["https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=800&q=80"]
  },
  {
    title: "Rolex Submariner Date - 2024",
    category: "Fashion & Beauty",
    subcategory: "Watches",
    price: 4500000,
    description: "Brand new Rolex Submariner. Full set with box and papers. Green bezel (Starbucks).",
    images: ["https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800&q=80"]
  },
  {
    title: "Premium Men's Leather Shoes",
    category: "Fashion & Beauty",
    subcategory: "Shoes",
    price: 15000,
    description: "Handcrafted pure leather oxford shoes. Durable and stylish for formal occasions.",
    images: ["https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&q=80"]
  },
  {
    title: "Luxury Perfume Set - Dior & Chanel",
    category: "Fashion & Beauty",
    subcategory: "Perfumes",
    price: 85000,
    description: "Collection of 5 miniature luxury perfumes. Perfect for gifting or personal use.",
    images: ["https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=80"]
  },
  {
    title: "Silk Embroidered Shawl",
    category: "Fashion & Beauty",
    subcategory: "Women Clothing",
    price: 12000,
    description: "Pure silk shawl with intricate embroidery. Versatile piece for winter weddings.",
    images: ["https://images.unsplash.com/photo-1590736704728-f4730bb30770?w=800&q=80"]
  },

  // HOME & FURNITURE
  {
    title: "King Size Luxury Bed Set",
    category: "Home & Furniture",
    subcategory: "Beds",
    price: 185000,
    description: "Solid wood bed with velvet tufted headboard. Includes 2 side tables and dressing table.",
    images: ["https://images.unsplash.com/photo-1505693419148-ad30b357b833?w=800&q=80"]
  },
  {
    title: "L-Shaped Sectional Sofa",
    category: "Home & Furniture",
    subcategory: "Sofas",
    price: 95000,
    description: "Modern grey fabric sofa. Extremely comfortable with washable covers. Seats 6-7 people.",
    images: ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80"]
  },
  {
    title: "Samsung Side-by-Side Refrigerator",
    category: "Home & Furniture",
    subcategory: "Refrigerators",
    price: 425000,
    description: "700L capacity with ice and water dispenser. Digital inverter technology. SpaceMax design.",
    images: ["https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&q=80"]
  },
  {
    title: "Hand-Knotted Persian Rug",
    category: "Home & Furniture",
    subcategory: "Home Decor",
    price: 150000,
    description: "Authentic wool and silk rug. Size 9x12 feet. Antique patterns from Iran.",
    images: ["https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=800&q=80"]
  },
  {
    title: "Dining Table Set - 8 Chairs",
    category: "Home & Furniture",
    subcategory: "Tables",
    price: 120000,
    description: "Glass top dining table with carved wooden base. 8 high-back chairs with fabric upholstery.",
    images: ["https://images.unsplash.com/photo-1530018607912-eff2314831bf?w=800&q=80"]
  },

  // GROCERY & FOOD
  {
    title: "Premium Organic Mangoes - Box",
    category: "Grocery & Food",
    subcategory: "Fruits",
    price: 2500,
    description: "Freshly picked Sindhri mangoes. 10kg export quality box. Sweet and aromatic.",
    images: ["https://images.unsplash.com/photo-1553279768-865429fa0078?w=800&q=80"]
  },
  {
    title: "Imported Chocolate Hamper",
    category: "Grocery & Food",
    subcategory: "Snacks",
    price: 8500,
    description: "Assorted luxury chocolates including Ferrero, Lindt, and Godiva. Beautifully packaged.",
    images: ["https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=800&q=80"]
  },
  {
    title: "Wagyu Beef Steaks - Frozen",
    category: "Grocery & Food",
    subcategory: "Meat",
    price: 45000,
    description: "High marbling A5 Wagyu beef from Japan. 2 portions of 250g each.",
    images: ["https://images.unsplash.com/photo-1546241072-48020ad13828?w=800&q=80"]
  },
  {
    title: "Organic Honey Collection",
    category: "Grocery & Food",
    subcategory: "Beverages",
    price: 3500,
    description: "Natural sidr and flower honey. 100% pure and unprocessed. 1kg jar.",
    images: ["https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=800&q=80"]
  },
  {
    title: "Artisanal Sourdough Bread",
    category: "Grocery & Food",
    subcategory: "Bakery Items",
    price: 850,
    description: "Freshly baked every morning. Crunchy crust and soft airy inside.",
    images: ["https://images.unsplash.com/photo-1585478259715-876acc5be8eb?w=800&q=80"]
  },

  // HEALTH & SPORTS
  {
    title: "Technogym Treadmill - Pro",
    category: "Health & Sports",
    subcategory: "Gym Equipment",
    price: 450000,
    description: "Professional grade treadmill. Interactive display, heart rate monitors, and preset workouts.",
    images: ["https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800&q=80"]
  },
  {
    title: "CA Gold Edition Cricket Bat",
    category: "Health & Sports",
    subcategory: "Cricket",
    price: 85000,
    description: "Grade 1 English willow bat. Used by international players. Perfect balance and ping.",
    images: ["https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&q=80"]
  },
  {
    title: "Mountain Bike - Giant Anthem",
    category: "Health & Sports",
    subcategory: "Fitness Accessories",
    price: 285000,
    description: "Full suspension mountain bike. Carbon frame, SRAM components. Ready for trails.",
    images: ["https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800&q=80"]
  },
  {
    title: "Whey Protein Isolate - 5lbs",
    category: "Health & Sports",
    subcategory: "Supplements",
    price: 18500,
    description: "Premium chocolate flavor protein. Low carb, low fat. Ideal for muscle recovery.",
    images: ["https://images.unsplash.com/photo-1593060641756-17b5f0945934?w=800&q=80"]
  },
  {
    title: "Electronic Yoga Mat",
    category: "Health & Sports",
    subcategory: "Fitness Accessories",
    price: 12000,
    description: "Non-slip smart mat with integrated pose detection and guided meditation.",
    images: ["https://images.unsplash.com/photo-1592419044706-39796d40f98c?w=800&q=80"]
  },

  // KIDS & BABIES
  {
    title: "Remote Controlled Tesla Toy",
    category: "Kids & Babies",
    subcategory: "Toys",
    price: 45000,
    description: "Large scale ride-on car for kids. Remote control for parents, MP3 player, and leather seats.",
    images: ["https://images.unsplash.com/photo-1558089687-f282ff9d758f?w=800&q=80"]
  },
  {
    title: "Baby Stroller - Silver Cross",
    category: "Kids & Babies",
    subcategory: "Strollers",
    price: 125000,
    description: "Luxury travel system. includes carrycot, seat unit, and car seat adapters.",
    images: ["https://images.unsplash.com/photo-1591576449102-14073d843472?w=800&q=80"]
  },
  {
    title: "LEGO Star Wars Millennium Falcon",
    category: "Kids & Babies",
    subcategory: "Toys",
    price: 185000,
    description: "Ultimate Collector Series. 7500+ pieces. Sealed box, never opened.",
    images: ["https://images.unsplash.com/photo-1585366119957-e9730b6d0f60?w=800&q=80"]
  },
  {
    title: "Educational Tablet for Kids",
    category: "Kids & Babies",
    subcategory: "School Accessories",
    price: 15000,
    description: "Pre-loaded with learning apps. Drop-proof case, parental controls, and eye-protection screen.",
    images: ["https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=800&q=80"]
  },
  {
    title: "Organic Cotton Baby Clothes",
    category: "Kids & Babies",
    subcategory: "Baby Clothing",
    price: 6500,
    description: "Set of 5 onesies. Super soft, breathable, and safe for sensitive skin.",
    images: ["https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&q=80"]
  },

  // BOOKS & EDUCATION
  {
    title: "Medical Encyclopedia - Full Set",
    category: "Books & Education",
    subcategory: "Academic Books",
    price: 45000,
    description: "Latest edition, glossy pages with detailed illustrations. Essential for medical students.",
    images: ["https://images.unsplash.com/photo-1532012197267-da84d127e765?w=800&q=80"]
  },
  {
    title: "Kindle Oasis - 32GB",
    category: "Books & Education",
    subcategory: "Stationery",
    price: 65000,
    description: "Waterproof e-reader with adjustable warm light. Perfect for avid readers.",
    images: ["https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=800&q=80"]
  },
  {
    title: "Set of Classics - Penguin Clothbound",
    category: "Books & Education",
    subcategory: "Novels",
    price: 25000,
    description: "10 beautiful hardcover classics from Austen to Dickens. Collector's edition.",
    images: ["https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=800&q=80"]
  },
  {
    title: "Online Coding Bootcamp - Full Stack",
    category: "Books & Education",
    subcategory: "Online Courses",
    price: 85000,
    description: "Learn MERN stack from scratch. Includes lifetime access and career support.",
    images: ["https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80"]
  },
  {
    title: "IELTS Preparation Kit - 2024",
    category: "Books & Education",
    subcategory: "Academic Books",
    price: 4500,
    description: "Updated past papers and speaking guides. Includes audio CDs for listening practice.",
    images: ["https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&q=80"]
  },

  // JOBS & SERVICES
  {
    title: "Senior Full Stack Developer Needed",
    category: "Jobs & Services",
    subcategory: "IT Jobs",
    price: 250000,
    description: "Remote opportunity for experienced React and Node.js developers. Competitive salary.",
    images: ["https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&q=80"]
  },
  {
    title: "Professional Home Cleaning Service",
    category: "Jobs & Services",
    subcategory: "Home Services",
    price: 5000,
    description: "Deep cleaning for apartments and houses. Experienced staff and eco-friendly equipment.",
    images: ["https://images.unsplash.com/photo-1581578731548-c64695cc6958?w=800&q=80"]
  },
  {
    title: "Graphic Design - Branding Logo",
    category: "Jobs & Services",
    subcategory: "Graphic Design",
    price: 15000,
    description: "Build your corporate identity. 3 logo concepts with unlimited revisions.",
    images: ["https://images.unsplash.com/photo-1626785774573-4b799315345d?w=800&q=80"]
  },
  {
    title: "Solar Panel Installation Service",
    category: "Jobs & Services",
    subcategory: "Repair Services",
    price: 550000,
    description: "Complete 5kW solar solution. Includes panels, inverter, and installation with net metering.",
    images: ["https://images.unsplash.com/photo-1509391366360-fe5bb658589b?w=800&q=80"]
  },
  {
    title: "Professional Event Photographer",
    category: "Jobs & Services",
    subcategory: "Photography",
    price: 25000,
    description: "Capture your special moments. 4 hours coverage with 50 edited high-res photos.",
    images: ["https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=800&q=80"]
  },

  // BUSINESS & INDUSTRIAL
  {
    title: "Heavy Lead Acid Battery Charger",
    category: "Business & Industrial",
    subcategory: "Generators",
    price: 45000,
    description: "Professional grade charger for industrial batteries. Multi-mode charging.",
    images: ["https://images.unsplash.com/photo-1601597111158-2fceff292cdc?w=800&q=80"]
  }
];

// Generate more to reach 5 per category
const categories = [
  "Electronics", "Vehicles", "Property", "Fashion & Beauty", "Home & Furniture",
  "Grocery & Food", "Health & Sports", "Kids & Babies", "Books & Education",
  "Jobs & Services", "Business & Industrial", "Pets & Animals", "Agriculture",
  "Events & Entertainment", "Collectibles & Miscellaneous", "Free Stuff"
];

const cities = ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad"];

async function seed() {
  await seedUser();
  console.log("Seeding listings...");
  
  // Add predefined ones first
  for (const list of sampleListings) {
    const data = {
      ...list,
      ownerId: SEED_USER_ID,
      sellerName: "Official Store",
      phoneNumber: "+923001234567",
      city: cities[Math.floor(Math.random() * cities.length)],
      isFeatured: Math.random() > 0.8,
      isBoosted: Math.random() > 0.8,
      status: 'LIVE',
      quantity: 10,
      shippingCharges: 250,
      promotionStatus: 'NONE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      views: Math.floor(Math.random() * 1000),
      saves: Math.floor(Math.random() * 100),
      shares: Math.floor(Math.random() * 50)
    };
    await addDoc(collection(db, 'listings'), data);
  }

  // Ensure 5 per category
  for (const catName of categories) {
    const currentCount = sampleListings.filter(l => l.category === catName).length;
    const itemsToAdd = Math.max(0, 5 - currentCount);
    
    for (let i = 0; i < itemsToAdd; i++) {
        const isSold = catName === 'Electronics' && i === 0; // Make one sold out for Electronics
        const data = {
            title: `Seeded ${catName} Item ${i + 1}`,
            description: `Quality ${catName} product for the best price in market. Verified by Treasure Hub.`,
            category: catName,
            price: 5000 + (Math.random() * 10000),
            ownerId: SEED_USER_ID,
            sellerName: "Official Store",
            phoneNumber: "+923001234567",
            city: cities[Math.floor(Math.random() * cities.length)],
            isFeatured: Math.random() > 0.9,
            isBoosted: Math.random() > 0.9,
            status: isSold ? 'SOLD' : 'LIVE',
            quantity: isSold ? 0 : 5,
            shippingCharges: 150,
            promotionStatus: 'NONE',
            images: ["https://images.unsplash.com/photo-1472851294608-062f824d5868?w=800&q=80"],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        await addDoc(collection(db, 'listings'), data);
    }
  }

  // Add items for specific home sections if not covered
  // Mobiles, Cars, Tabs, Laptops, Motorcycle & Bicycle, Home
  const homeSections = [
      { cat: 'Electronics', subcat: 'Tablets' },
      { cat: 'Vehicles', subcat: 'Motorcycles' }
  ];
  for (const sec of homeSections) {
      for (let i = 0; i < 5; i++) {
          await addDoc(collection(db, 'listings'), {
              title: `Home Section ${sec.subcat} ${i + 1}`,
              description: `Special inventory item for ${sec.subcat}.`,
              category: sec.cat,
              subcategory: sec.subcat,
              price: 20000 + (Math.random() * 50000),
              ownerId: SEED_USER_ID,
              sellerName: "Official Store",
              phoneNumber: "+923001234567",
              city: "Lahore",
              isFeatured: true,
              status: 'LIVE',
              quantity: 1,
              images: ["https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800&q=80"],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
          });
      }
  }

  console.log("Seeding completed successfully!");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
