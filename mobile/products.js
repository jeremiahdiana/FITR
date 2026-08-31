export const allProducts = [
  // ── SUPPLEMENTS ──
  { id:1,  brand:'Ghost',             name:'Legend Pre-Workout',       price:44.99, old:54.99, rating:5, reviews:'2.1k', badge:'SALE', cat:'supps', isNew:false, img:'https://ghostlifestyle.com/cdn/shop/files/GHOST-LEGEND-V3-ALL-STARS-WARHEAD-LEMON-BERRY.png' },
  { id:2,  brand:'Ghost',             name:'Whey Protein 2lb',         price:49.99, old:59.99, rating:5, reviews:'3.2k', badge:'SALE', cat:'supps', isNew:false, img:'https://ghostlifestyle.com/cdn/shop/files/GHOST-WHEY-PROTEIN-POWDER-OREO.png' },
  { id:3,  brand:'Optimum',           name:'Gold Standard Whey 5lb',   price:59.99, old:74.99, rating:5, reviews:'8.4k', badge:'BEST', cat:'supps', isNew:false, img:'https://www.optimumnutrition.com/dw/image/v2/BFCB_PRD/on/demandware.static/Sites-site-Site/default/dw25f15c5a/images/main/748927026610.jpg' },
  { id:4,  brand:'Optimum',           name:'Serious Mass 12lb',        price:54.99, old:69.99, rating:4, reviews:'5.1k', badge:null,   cat:'supps', isNew:false, img:'https://www.optimumnutrition.com/dw/image/v2/BFCB_PRD/on/demandware.static/Sites-site-Site/default/dw/images/main/serious-mass-chocolate.jpg' },
  { id:5,  brand:'Cellucor',          name:'C4 Original 60srv',        price:34.99, old:44.99, rating:4, reviews:'11k',  badge:'SALE', cat:'supps', isNew:false, img:'https://www.cellucor.com/cdn/shop/files/C4-Original-Pre-Workout-Watermelon.png' },
  { id:6,  brand:'Gorilla Mind',      name:'Smooth Focus Caps',        price:49.95, old:59.95, rating:4, reviews:'1.3k', badge:'HOT',  cat:'supps', isNew:false, img:'https://gorillamind.com/cdn/shop/products/gorilla-mind-smooth.jpg' },
  { id:7,  brand:'Thorne',            name:'Creatine Powder',          price:44.00, old:52.00, rating:5, reviews:'890',  badge:null,   cat:'supps', isNew:false, img:'https://www.thorne.com/media/image/product/thorne-creatine-powder.jpg' },
  { id:8,  brand:'Transparent Labs',  name:'Bulk Pre-Workout',         price:49.99, old:null,  rating:5, reviews:'2.8k', badge:null,   cat:'supps', isNew:true,  img:'https://www.transparentlabs.com/cdn/shop/products/bulk-pre-workout-supplement.jpg' },
  { id:9,  brand:'Legion',            name:'Whey+ Protein 2lb',        price:59.99, old:null,  rating:5, reviews:'4.2k', badge:null,   cat:'supps', isNew:false, img:'https://legionathletics.com/cdn/shop/products/legion-whey-plus-protein-chocolate.jpg' },
  { id:10, brand:'Alpha Lion',        name:'Superhuman Pre-Workout',   price:54.99, old:64.99, rating:4, reviews:'1.7k', badge:'HOT',  cat:'supps', isNew:false, img:'https://alphalion.com/cdn/shop/products/alpha-lion-superhuman-pre.jpg' },
  { id:11, brand:'BSN',               name:'Syntha-6 Protein 5lb',     price:44.99, old:54.99, rating:4, reviews:'6.3k', badge:'SALE', cat:'supps', isNew:false, img:'https://bsnusa.com/cdn/shop/products/syntha-6-ultra-premium-protein.jpg' },

  // ── GYM GEAR ──
  { id:12, brand:'Rogue',             name:'Ohio Bar 20kg',            price:295.00, old:350.00, rating:4, reviews:'942',  badge:null,   cat:'gear', isNew:true,  img:'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600/catalog/product/r/o/rogue-ohio-bar-hero.jpg' },
  { id:13, brand:'Rogue',             name:'Monster Bands Set',        price:64.00,  old:null,   rating:5, reviews:'502',  badge:null,   cat:'gear', isNew:false, img:'https://assets.roguefitness.com/f_auto,q_auto,c_limit,w_1600/catalog/product/r/o/rogue-monster-bands.jpg' },
  { id:14, brand:'Rep Fitness',       name:'Adjustable Dumbbells Set', price:349.00, old:429.00, rating:5, reviews:'1.1k', badge:'SALE', cat:'gear', isNew:false, img:'https://cdn.repfitness.com/cdn/shop/products/rep-fitness-adjustable-dumbbell-set.jpg' },
  { id:15, brand:'Yes4All',           name:'Cast Iron Kettlebell 35lb',price:39.99,  old:49.99,  rating:4, reviews:'3.4k', badge:null,   cat:'gear', isNew:false, img:'https://www.yes4all.com/cdn/shop/products/cast-iron-competition-kettlebell-35lb.jpg' },

  // ── APPAREL ──
  { id:16, brand:'Nike',              name:'Dri-FIT Training Tee',     price:35.00, old:null,  rating:4, reviews:'4.7k', badge:null,   cat:'apparel', isNew:true,  img:'https://static.nike.com/a/images/c_limit,w_592/f_auto/t_product_v1/dri-fit-training-tee.jpg' },
  { id:17, brand:'Nike',              name:'Pro Compression Shorts',   price:40.00, old:50.00, rating:4, reviews:'2.9k', badge:null,   cat:'apparel', isNew:false, img:'https://static.nike.com/a/images/c_limit,w_592/f_auto/t_product_v1/pro-compression-shorts.jpg' },
  { id:18, brand:'Gymshark',          name:'Vital Seamless Leggings',  price:60.00, old:75.00, rating:5, reviews:'6.8k', badge:'BEST', cat:'apparel', isNew:false, img:'https://cdn.shopify.com/s/files/1/0098/8822/products/gymshark-vital-seamless-leggings-black.jpg' },
  { id:19, brand:'Gymshark',          name:'Flex Training Shorts',     price:45.00, old:null,  rating:4, reviews:'3.1k', badge:null,   cat:'apparel', isNew:false, img:'https://cdn.shopify.com/s/files/1/0098/8822/products/gymshark-flex-shorts-black.jpg' },
  { id:20, brand:'Alphalete',         name:'Amplify Shorts',           price:55.00, old:65.00, rating:5, reviews:'2.2k', badge:'HOT',  cat:'apparel', isNew:false, img:'https://cdn.alphalete.com/cdn/shop/products/amplify-shorts-black.jpg' },
  { id:21, brand:'Under Armour',      name:'Rush 2.0 Training Tee',    price:35.00, old:null,  rating:4, reviews:'1.8k', badge:null,   cat:'apparel', isNew:true,  img:'https://underarmour.scene7.com/is/image/Underarmour/V5-1366138-001_FC' },

  // ── RECOVERY ──
  { id:22, brand:'Thorne',            name:'Omega-3 w/ CoQ10',         price:39.99,  old:null,   rating:5, reviews:'620',  badge:null,   cat:'recovery', isNew:true,  img:'https://www.thorne.com/media/image/product/thorne-omega3-coq10.jpg' },
  { id:23, brand:'Hyperice',          name:'Hypervolt 2 Massager',     price:199.00, old:249.00, rating:5, reviews:'3.5k', badge:'SALE', cat:'recovery', isNew:false, img:'https://hyperice.com/cdn/shop/products/hypervolt-2-percussive-massager.jpg' },
  { id:24, brand:'Therabody',         name:'Theragun Mini',            price:199.00, old:229.00, rating:4, reviews:'2.1k', badge:null,   cat:'recovery', isNew:false, img:'https://www.therabody.com/cdn/shop/products/theragun-mini-black.jpg' },
  { id:25, brand:'Hyperice',          name:'NormaTec 3 Leg System',    price:699.00, old:799.00, rating:5, reviews:'890',  badge:'BEST', cat:'recovery', isNew:false, img:'https://hyperice.com/cdn/shop/products/normatec-3-leg-recovery-system.jpg' },
];

export const categories = [
  { key: 'all',      label: '🔥 All' },
  { key: 'supps',    label: '💊 Supplements' },
  { key: 'gear',     label: '🏋️ Gym Gear' },
  { key: 'apparel',  label: '👕 Apparel' },
  { key: 'recovery', label: '🧊 Recovery' },
];
