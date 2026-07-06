/**
 * catalogueSeed.ts — Catalogue complet Vita Fresh
 * Fruits, légumes et herbes avec photos Unsplash
 * Utilisé comme fallback si Supabase n'a pas de données
 */

export interface SeedArticle {
  id: string
  nom: string
  nom_ar: string
  famille: string
  unite: string
  prix_public: number
  marketplace_actif: boolean
  marketplace_prix_public: number
  image_url: string
  description: string
  tags: string[]
  ordre: number
  statut: string
}

const PHOTO = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=400&h=400&fit=crop&auto=format&q=80`

export const CATALOGUE_SEED: SeedArticle[] = [
  // ══════════════════════════════════════════════════════
  // FRUITS
  // ══════════════════════════════════════════════════════
  {
    id: "fruit-tomate", nom: "Tomates", nom_ar: "طماطم",
    famille: "Fruits", unite: "kg", prix_public: 4.5, marketplace_actif: true, marketplace_prix_public: 4.5,
    image_url: PHOTO("1546094096-0df4bcaad337"),
    description: "Tomates fraîches de saison, gorgées de soleil. Idéales pour salades, sauces et tajines.",
    tags: ["frais", "local", "saison"], ordre: 1, statut: "actif",
  },
  {
    id: "fruit-orange", nom: "Oranges", nom_ar: "برتقال",
    famille: "Fruits", unite: "kg", prix_public: 5, marketplace_actif: true, marketplace_prix_public: 5,
    image_url: PHOTO("1547514701-42782101795e"),
    description: "Oranges juteuses du Maroc, riches en vitamine C. Parfaites pour jus et desserts.",
    tags: ["vitaminé", "jus", "local"], ordre: 2, statut: "actif",
  },
  {
    id: "fruit-pomme", nom: "Pommes", nom_ar: "تفاح",
    famille: "Fruits", unite: "kg", prix_public: 7, marketplace_actif: true, marketplace_prix_public: 7,
    image_url: PHOTO("1560806887-1e4cd0b6cbd6"),
    description: "Pommes croquantes et sucrées. Variétés sélectionnées pour leur fraîcheur et leur goût.",
    tags: ["croquant", "sucré"], ordre: 3, statut: "actif",
  },
  {
    id: "fruit-banane", nom: "Bananes", nom_ar: "موز",
    famille: "Fruits", unite: "kg", prix_public: 6, marketplace_actif: true, marketplace_prix_public: 6,
    image_url: PHOTO("1571771894821-ce9b6c11b08e"),
    description: "Bananes mûres à point, riches en potassium et en énergie.",
    tags: ["énergie", "sport"], ordre: 4, statut: "actif",
  },
  {
    id: "fruit-citron", nom: "Citrons", nom_ar: "ليمون",
    famille: "Fruits", unite: "kg", prix_public: 5, marketplace_actif: true, marketplace_prix_public: 5,
    image_url: PHOTO("1590502593747-42a996133562"),
    description: "Citrons frais acides et parfumés. Indispensables en cuisine marocaine.",
    tags: ["acidulé", "cuisine", "vitaminé"], ordre: 5, statut: "actif",
  },
  {
    id: "fruit-pasteque", nom: "Pastèque", nom_ar: "دلاح",
    famille: "Fruits", unite: "pièce", prix_public: 20, marketplace_actif: true, marketplace_prix_public: 20,
    image_url: PHOTO("1587049352846-4a222e784d38"),
    description: "Pastèque fraîche et sucrée. Désaltérante en été.",
    tags: ["été", "frais", "sucré"], ordre: 6, statut: "actif",
  },
  {
    id: "fruit-raisin", nom: "Raisin", nom_ar: "عنب",
    famille: "Fruits", unite: "kg", prix_public: 12, marketplace_actif: true, marketplace_prix_public: 12,
    image_url: PHOTO("1537640538966-79f369143f8f"),
    description: "Raisin frais, noir et blanc. Goût sucré intense.",
    tags: ["sucré", "premium"], ordre: 7, statut: "actif",
  },
  {
    id: "fruit-fraise", nom: "Fraises", nom_ar: "فراولة",
    famille: "Fruits", unite: "kg", prix_public: 15, marketplace_actif: true, marketplace_prix_public: 15,
    image_url: PHOTO("1464965911861-746a04b4bca6"),
    description: "Fraises rouges et parfumées du Maroc, excellentes en desserts.",
    tags: ["dessert", "parfumé", "premium"], ordre: 8, statut: "actif",
  },
  {
    id: "fruit-peche", nom: "Pêches", nom_ar: "خوخ",
    famille: "Fruits", unite: "kg", prix_public: 9, marketplace_actif: true, marketplace_prix_public: 9,
    image_url: PHOTO("1595475207225-428b62bda831"),
    description: "Pêches juteuses et sucrées de saison.",
    tags: ["saison", "juteux"], ordre: 9, statut: "actif",
  },
  {
    id: "fruit-melon", nom: "Melon", nom_ar: "بطيخ أصفر",
    famille: "Fruits", unite: "pièce", prix_public: 18, marketplace_actif: true, marketplace_prix_public: 18,
    image_url: PHOTO("1571575173700-afb9492d8584"),
    description: "Melon jaune sucré et parfumé. Chair fondante.",
    tags: ["été", "sucré", "parfumé"], ordre: 10, statut: "actif",
  },
  {
    id: "fruit-clementine", nom: "Clémentines", nom_ar: "يوسفي",
    famille: "Fruits", unite: "kg", prix_public: 6, marketplace_actif: true, marketplace_prix_public: 6,
    image_url: PHOTO("1580005893-e3c284cc0ae1"),
    description: "Clémentines marocaines sans pépins, sucrées et faciles à éplucher.",
    tags: ["hiver", "vitaminé", "sans pépins"], ordre: 11, statut: "actif",
  },
  {
    id: "fruit-avocat", nom: "Avocats", nom_ar: "أفوكادو",
    famille: "Fruits", unite: "pièce", prix_public: 5, marketplace_actif: true, marketplace_prix_public: 5,
    image_url: PHOTO("1550258987-190a2d41a8ba"),
    description: "Avocats crémeux, riches en bons lipides. Idéaux pour salades et guacamole.",
    tags: ["healthy", "premium", "tendance"], ordre: 12, statut: "actif",
  },
  {
    id: "fruit-grenade", nom: "Grenade", nom_ar: "رمان",
    famille: "Fruits", unite: "pièce", prix_public: 4, marketplace_actif: true, marketplace_prix_public: 4,
    image_url: PHOTO("1615485736778-ca0a23af9993"),
    description: "Grenade fraîche aux arilles rubis, riche en antioxydants.",
    tags: ["antioxydant", "hiver", "local"], ordre: 13, statut: "actif",
  },

  // ══════════════════════════════════════════════════════
  // LÉGUMES
  // ══════════════════════════════════════════════════════
  {
    id: "leg-carotte", nom: "Carottes", nom_ar: "جزر",
    famille: "Légumes", unite: "kg", prix_public: 3, marketplace_actif: true, marketplace_prix_public: 3,
    image_url: PHOTO("1598170845058-32b9d6a5da37"),
    description: "Carottes fraîches et croquantes, riches en bêta-carotène.",
    tags: ["vitaminé", "croquant", "local"], ordre: 20, statut: "actif",
  },
  {
    id: "leg-pomme-de-terre", nom: "Pommes de terre", nom_ar: "بطاطس",
    famille: "Légumes", unite: "kg", prix_public: 3.5, marketplace_actif: true, marketplace_prix_public: 3.5,
    image_url: PHOTO("1518977676601-b53f82aba655"),
    description: "Pommes de terre fraîches, idéales pour toutes les préparations.",
    tags: ["polyvalent", "local", "essentiel"], ordre: 21, statut: "actif",
  },
  {
    id: "leg-oignon", nom: "Oignons", nom_ar: "بصل",
    famille: "Légumes", unite: "kg", prix_public: 2.5, marketplace_actif: true, marketplace_prix_public: 2.5,
    image_url: PHOTO("1618512496248-a4f7b6ed0e3d"),
    description: "Oignons rouges et blancs, base de toute bonne cuisine.",
    tags: ["essentiel", "cuisine", "local"], ordre: 22, statut: "actif",
  },
  {
    id: "leg-courgette", nom: "Courgettes", nom_ar: "كوسة",
    famille: "Légumes", unite: "kg", prix_public: 4, marketplace_actif: true, marketplace_prix_public: 4,
    image_url: PHOTO("1566842600175-97dca3c5ad8d"),
    description: "Courgettes tendres et légères. Excellentes grillées, farcies ou en tajine.",
    tags: ["léger", "été", "tajine"], ordre: 23, statut: "actif",
  },
  {
    id: "leg-concombre", nom: "Concombres", nom_ar: "خيار",
    famille: "Légumes", unite: "kg", prix_public: 3.5, marketplace_actif: true, marketplace_prix_public: 3.5,
    image_url: PHOTO("1604977042946-1eecc30f269e"),
    description: "Concombres frais et croquants. Parfaits en salades.",
    tags: ["frais", "salade", "hydratant"], ordre: 24, statut: "actif",
  },
  {
    id: "leg-poivron", nom: "Poivrons", nom_ar: "فلفل أحمر",
    famille: "Légumes", unite: "kg", prix_public: 8, marketplace_actif: true, marketplace_prix_public: 8,
    image_url: PHOTO("1563565375-f3fdfdbefa83"),
    description: "Poivrons rouges, verts et jaunes, sucrés et croquants.",
    tags: ["coloré", "vitaminé", "cuisine"], ordre: 25, statut: "actif",
  },
  {
    id: "leg-aubergine", nom: "Aubergines", nom_ar: "باذنجان",
    famille: "Légumes", unite: "kg", prix_public: 5, marketplace_actif: true, marketplace_prix_public: 5,
    image_url: PHOTO("1501426026826-31c667bdf23d"),
    description: "Aubergines brillantes, idéales pour zaalouk et tajine.",
    tags: ["zaalouk", "tajine", "marocain"], ordre: 26, statut: "actif",
  },
  {
    id: "leg-chou", nom: "Chou", nom_ar: "كرنب",
    famille: "Légumes", unite: "pièce", prix_public: 4, marketplace_actif: true, marketplace_prix_public: 4,
    image_url: PHOTO("1598030304671-5aa1d6f2e82c"),
    description: "Chou vert tendre et croquant. Excellent en salade et cuit.",
    tags: ["hivernal", "fibre"], ordre: 27, statut: "actif",
  },
  {
    id: "leg-haricot", nom: "Haricots verts", nom_ar: "لوبيا خضراء",
    famille: "Légumes", unite: "kg", prix_public: 7, marketplace_actif: true, marketplace_prix_public: 7,
    image_url: PHOTO("1556030814-1b8dd21f9a25"),
    description: "Haricots verts fins et tendres. Cuisinés à la vapeur ou en tajine.",
    tags: ["fin", "vapeur", "tajine"], ordre: 28, statut: "actif",
  },
  {
    id: "leg-piment", nom: "Piments", nom_ar: "هريسة خضراء",
    famille: "Légumes", unite: "kg", prix_public: 6, marketplace_actif: true, marketplace_prix_public: 6,
    image_url: PHOTO("1558618666-fcd25c85cd64"),
    description: "Piments verts et rouges frais. Indispensables en cuisine marocaine.",
    tags: ["épicé", "marocain", "cuisine"], ordre: 29, statut: "actif",
  },
  {
    id: "leg-navet", nom: "Navets", nom_ar: "لفت",
    famille: "Légumes", unite: "kg", prix_public: 2.5, marketplace_actif: true, marketplace_prix_public: 2.5,
    image_url: PHOTO("1610725663727-b0f9b0fe6edd"),
    description: "Navets blancs fermes. Parfaits dans les couscous et tajines d'hiver.",
    tags: ["hivernal", "couscous", "tajine"], ordre: 30, statut: "actif",
  },
  {
    id: "leg-betterave", nom: "Betteraves", nom_ar: "شمندر",
    famille: "Légumes", unite: "kg", prix_public: 3, marketplace_actif: true, marketplace_prix_public: 3,
    image_url: PHOTO("1614648228447-5c69cf76df80"),
    description: "Betteraves rouges sucrées, riches en fer et en antioxydants.",
    tags: ["santé", "rouge", "salade"], ordre: 31, statut: "actif",
  },
  {
    id: "leg-epinard", nom: "Épinards", nom_ar: "سبانخ",
    famille: "Légumes", unite: "botte", prix_public: 4, marketplace_actif: true, marketplace_prix_public: 4,
    image_url: PHOTO("1576045057995-568f1167e03e"),
    description: "Épinards frais et tendres. Riches en fer et vitamines.",
    tags: ["santé", "fer", "vitamines"], ordre: 32, statut: "actif",
  },
  {
    id: "leg-ail", nom: "Ail", nom_ar: "ثوم",
    famille: "Légumes", unite: "tête", prix_public: 2, marketplace_actif: true, marketplace_prix_public: 2,
    image_url: PHOTO("1622205313610-696b0f8c9d0f"),
    description: "Ail frais blanc. Indispensable en cuisine marocaine.",
    tags: ["aromate", "essentiel", "marocain"], ordre: 33, statut: "actif",
  },
  {
    id: "leg-celeri", nom: "Céleri", nom_ar: "كرفس",
    famille: "Légumes", unite: "botte", prix_public: 5, marketplace_actif: true, marketplace_prix_public: 5,
    image_url: PHOTO("1589927986089-35812388d1f4"),
    description: "Céleri branche frais et croquant. Parfait pour jus et soupes.",
    tags: ["jus", "soupe", "détox"], ordre: 34, statut: "actif",
  },

  // ══════════════════════════════════════════════════════
  // HERBES FRAÎCHES
  // ══════════════════════════════════════════════════════
  {
    id: "herbe-menthe", nom: "Menthe fraîche", nom_ar: "نعناع",
    famille: "Herbes", unite: "botte", prix_public: 2, marketplace_actif: true, marketplace_prix_public: 2,
    image_url: PHOTO("1628556270448-4d4e4148e1b1"),
    description: "Menthe fraîche marocaine, parfumée et intense. Thé à la menthe et cuisine.",
    tags: ["thé", "marocain", "parfumé", "essentiel"], ordre: 40, statut: "actif",
  },
  {
    id: "herbe-coriandre", nom: "Coriandre", nom_ar: "قصبر",
    famille: "Herbes", unite: "botte", prix_public: 2, marketplace_actif: true, marketplace_prix_public: 2,
    image_url: PHOTO("1607305387299-a3d9611cd469"),
    description: "Coriandre fraîche au parfum unique. Base de la cuisine marocaine.",
    tags: ["marocain", "essentiel", "parfumé"], ordre: 41, statut: "actif",
  },
  {
    id: "herbe-persil", nom: "Persil", nom_ar: "معدنوس",
    famille: "Herbes", unite: "botte", prix_public: 2, marketplace_actif: true, marketplace_prix_public: 2,
    image_url: PHOTO("1574481611-04f3d34cfade"),
    description: "Persil plat frais et parfumé. Essentiel pour toutes les sauces.",
    tags: ["essentiel", "sauce", "garnir"], ordre: 42, statut: "actif",
  },
  {
    id: "herbe-thym", nom: "Thym", nom_ar: "زعتر",
    famille: "Herbes", unite: "botte", prix_public: 3, marketplace_actif: true, marketplace_prix_public: 3,
    image_url: PHOTO("1543158181-e6f9f6f6b8b0"),
    description: "Thym frais, aromatique et antiseptique. Parfait pour grillades et marinades.",
    tags: ["aromatique", "grillades", "marinade"], ordre: 43, statut: "actif",
  },
  {
    id: "herbe-romarin", nom: "Romarin", nom_ar: "إكليل الجبل",
    famille: "Herbes", unite: "botte", prix_public: 3, marketplace_actif: true, marketplace_prix_public: 3,
    image_url: PHOTO("1591922959680-3b4dbfb0f01a"),
    description: "Romarin frais au parfum méditerranéen intense. Idéal pour viandes et légumes rôtis.",
    tags: ["méditerranéen", "viande", "rôti"], ordre: 44, statut: "actif",
  },
  {
    id: "herbe-basilic", nom: "Basilic", nom_ar: "ريحان",
    famille: "Herbes", unite: "botte", prix_public: 3, marketplace_actif: true, marketplace_prix_public: 3,
    image_url: PHOTO("1629397685945-4a4c2f6cb8e7"),
    description: "Basilic frais au parfum délicat. Indispensable pour salades et sauces.",
    tags: ["délicat", "salade", "italienne"], ordre: 45, statut: "actif",
  },
  {
    id: "herbe-laurier", nom: "Laurier", nom_ar: "غار",
    famille: "Herbes", unite: "botte", prix_public: 3, marketplace_actif: true, marketplace_prix_public: 3,
    image_url: PHOTO("1558618047-3c8c76ca7c56"),
    description: "Feuilles de laurier fraîches, parfumées. Incontournables dans les tajines et bouillons.",
    tags: ["tajine", "bouillon", "aromatique"], ordre: 46, statut: "actif",
  },
]
