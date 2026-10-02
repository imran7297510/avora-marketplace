export const CATEGORY_FIELDS: Record<string, {name: string, label: string, type: string, required?: boolean, options?: string[]}[]> = {
  'Vehicles': [
    { name: 'make', label: 'Make', type: 'text', required: true },
    { name: 'model', label: 'Model', type: 'text', required: true },
    { name: 'year', label: 'Year', type: 'number', required: true },
    { name: 'bodyType', label: 'Body Type', type: 'select', options: ['Sedan', 'SUV', 'Hatchback', 'Coupe', 'Truck', 'Van', 'Other'] },
    { name: 'color', label: 'Color', type: 'text' },
    { name: 'engineCapacity', label: 'Engine Capacity (cc)', type: 'text' },
    { name: 'transmission', label: 'Transmission', type: 'select', options: ['Manual', 'Automatic'] },
    { name: 'fuelType', label: 'Fuel Type', type: 'select', options: ['Petrol', 'Diesel', 'CNG', 'Hybrid', 'Electric'] },
    { name: 'registrationCity', label: 'Registration City', type: 'text' },
    { name: 'cngStatus', label: 'CNG Installed', type: 'select', options: ['Yes', 'No'] }
  ],
  'Mobiles & Tablets': [
    { name: 'brand', label: 'Brand', type: 'text', required: true },
    { name: 'model', label: 'Model', type: 'text', required: true },
    { name: 'ptaStatus', label: 'PTA Status', type: 'select', options: ['Approved', 'Not Approved'] },
    { name: 'storage', label: 'Storage', type: 'text' },
    { name: 'ram', label: 'RAM', type: 'text' },
    { name: 'condition_percent', label: 'Condition (%)', type: 'number' }
  ],
  'Electronics & Appliances': [
    { name: 'brand', label: 'Brand', type: 'text', required: true },
    { name: 'model', label: 'Model', type: 'text', required: true },
    { name: 'condition_percent', label: 'Condition (%)', type: 'number' }
  ],
  'Property': [
    { name: 'propertyType', label: 'Property Type', type: 'select', options: ['House', 'Flat', 'Plot', 'Commercial'] },
    { name: 'purpose', label: 'Purpose', type: 'select', options: ['Sale', 'Rent'] },
    { name: 'area', label: 'Area (Sq Ft / Marla)', type: 'text', required: true },
    { name: 'bedrooms', label: 'Bedrooms', type: 'number' },
    { name: 'bathrooms', label: 'Bathrooms', type: 'number' },
    { name: 'locationDetails', label: 'Phase / Block', type: 'text' }
  ],
  'Fashion & Clothing': [
    { name: 'type', label: 'Target', type: 'select', options: ['Men', 'Women', 'Kids', 'Unisex'] },
    { name: 'brand', label: 'Brand', type: 'text' },
    { name: 'size', label: 'Size', type: 'text' },
    { name: 'material', label: 'Material', type: 'text' }
  ],
  'Home & Living': [
    { name: 'itemType', label: 'Item Type', type: 'text' },
    { name: 'brand', label: 'Brand', type: 'text' },
    { name: 'dimensions', label: 'Dimensions', type: 'text' }
  ],
  'Grocery & Food': [
    { name: 'productType', label: 'Product Type', type: 'text' },
    { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
    { name: 'weight', label: 'Weight/Volume', type: 'text' }
  ],
  'Sports & Fitness': [
    { name: 'brand', label: 'Brand', type: 'text' },
    { name: 'usageLevel', label: 'Usage Level', type: 'text' }
  ],
  'Agriculture & Farming': [
    { name: 'itemType', label: 'Type (Livestock/Crop/Tool)', type: 'text' },
    { name: 'ageOrWeight', label: 'Age / Weight', type: 'text' },
    { name: 'breed', label: 'Breed', type: 'text' }
  ],
  'Jobs': [
    { name: 'experienceLevel', label: 'Experience Level', type: 'text' },
    { name: 'pricingType', label: 'Pricing Type', type: 'select', options: ['Hourly', 'Fixed', 'Monthly'] }
  ],
  'Pets & Animals': [
    { name: 'breed', label: 'Breed', type: 'text' },
    { name: 'age', label: 'Age', type: 'text' },
    { name: 'vaccinationStatus', label: 'Vaccination Status', type: 'text' }
  ],
  'Others / Miscellaneous': [
    { name: 'details', label: 'Additional Details', type: 'text' }
  ]
};
