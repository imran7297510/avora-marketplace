export const CATEGORIES_WITH_SUBCATEGORIES: Record<string, string[]> = {
  'Mobiles & Tablets': [
    "Smartphones", "Feature Phones", "Tablets", "Smartwatches", "Mobile Accessories", "Chargers", "Power Banks", "Headphones & Earbuds", "Mobile Covers & Cases", "Mobile Parts", "Mobile Repair Services", "Other Mobile Items"
  ],
  'Electronics & Appliances': [
    "Computers", "Laptops", "Desktop Computers", "Monitors", "Printers & Scanners", "Computer Accessories", "Storage Devices", "Networking Equipment", "Computer Components",
    "Televisions", "Home Theater Systems", "Speakers", "Projectors", "Streaming Devices",
    "Refrigerators", "Washing Machines", "Air Conditioners", "Water Dispensers", "Microwave Ovens", "Vacuum Cleaners", "Dishwashers", "Water Heaters (Geysers)",
    "Air Fryers", "Blenders", "Juicers", "Mixers", "Coffee Machines", "Electric Kettles", "Toasters", "Rice Cookers",
    "Chargers", "Cables", "Adapters", "Batteries", "Electronic Accessories",
    "Other Electronics & Appliances"
  ],
  'Vehicles': [
    "Cars", "SUVs & Jeeps", "Vans", "Trucks", "Buses", "Auto Parts", "Auto Accessories", "Vehicle Services", "Vehicle Rentals", "Other Vehicles"
  ],
  'Motorcycles & Bikes': [
    "Motorcycles", "Scooters", "Bicycles", "Electric Bikes", "Bike Parts", "Bike Accessories", "Bike Services", "Other Bikes"
  ],
  'Property': [
    "Houses for Sale", "Houses for Rent", "Apartments for Sale", "Apartments for Rent", "Residential Plots", "Commercial Plots", "Commercial Property", "Farmhouses", "Rooms & Portions", "Property Services", "Other Property"
  ],
  'Home & Living': [
    "Furniture", "Beds & Mattresses", "Sofas & Chairs", "Dining Furniture", "Home Decor", "Curtains & Blinds", "Carpets & Rugs", "Lighting", "Garden & Outdoor", "Home Improvement", "Storage & Organization", "Other Home Items"
  ],
  'Fashion & Clothing': [
    "Men's Clothing", "Women's Clothing", "Kids Clothing", "Footwear", "Watches", "Jewelry", "Bags", "Sunglasses", "Fashion Accessories", "Other Fashion Items"
  ],
  'Gaming': [
    "Gaming Consoles", "Video Games", "Gaming Accessories", "Gaming PCs", "Gaming Laptops", "Virtual Reality Devices", "Other Gaming Items"
  ],
  'Kids & Baby Products': [
    "Baby Clothing", "Baby Toys", "Baby Furniture", "Strollers", "Car Seats", "School Supplies", "Other Baby Products"
  ],
  'Sports & Fitness': [
    "Gym Equipment", "Exercise Machines", "Sports Equipment", "Outdoor Sports", "Cycling Gear", "Fitness Accessories", "Sportswear", "Other Sports Items"
  ],
  'Pets & Animals': [
    "Cats", "Dogs", "Birds", "Fish & Aquariums", "Pet Food", "Pet Accessories", "Pet Services", "Other Pets"
  ],
  'Agriculture & Farming': [
    "Tractors", "Farming Equipment", "Seeds", "Fertilizers", "Irrigation Equipment", "Crops", "Agricultural Services", "Livestock Feed", "Other Farming Items"
  ],
  'Livestock': [
    "Cows", "Buffaloes", "Goats", "Sheep", "Camels", "Horses", "Poultry", "Livestock Equipment", "Other Livestock"
  ],
  'Hobbies & Collectibles': [
    "Books", "Coins", "Stamps", "Antiques", "Art & Paintings", "Musical Instruments", "Handicrafts", "Collectibles", "Other Hobby Items"
  ],
  'Gifts & Occasions': [
    "Gift Items", "Flowers", "Customized Gifts", "Party Supplies", "Event Accessories", "Seasonal Gifts", "Other Gift Items"
  ],
  'Tools & Equipment': [
    "Power Tools", "Hand Tools", "Construction Equipment", "Industrial Equipment", "Workshop Equipment", "Safety Equipment", "Other Tools & Equipment"
  ],
  'Jobs': [
    "Full-Time Jobs", "Part-Time Jobs", "Freelance Jobs", "Remote Jobs", "Internships", "Skilled Labor", "Office Jobs", "Other Jobs"
  ],
  'Services': [
    "Home Services", "Repair Services", "Cleaning Services", "Moving Services", "IT Services", "Software Development", "Graphic Design", "Digital Marketing", "Photography & Videography", "Event Services", "Educational Services", "Business Services", "Other Services"
  ],
  'Education': [
    "Tuition", "Online Courses", "Training Programs", "Certifications", "Language Learning", "Academic Services", "Other Education Services"
  ],
  'Travel & Tourism': [
    "Tour Packages", "Hotels", "Guest Houses", "Vehicle Rentals", "Travel Services", "Travel Equipment", "Other Travel Listings"
  ],
  'Business & Industrial': [
    "Office Equipment", "Industrial Machinery", "Manufacturing Equipment", "Wholesale Products", "Retail Equipment", "Business Opportunities", "Other Business Listings"
  ],
  'Wholesale & Bulk Deals': [
    "Wholesale Mobiles", "Wholesale Electronics", "Wholesale Clothing", "Wholesale Grocery", "Wholesale Agriculture", "Wholesale Industrial Products", "Other Wholesale Items"
  ],
  'Others / Miscellaneous': [
    "General Items", "Unclassified Products", "Unique Items", "Community Listings", "Miscellaneous Products"
  ]
};

export const CATEGORIES = Object.keys(CATEGORIES_WITH_SUBCATEGORIES);
