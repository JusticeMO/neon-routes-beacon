export interface BusStop {
  name: string;
  lat: number;
  lng: number;
}

export interface Route {
  id: number;
  number: string;
  name: string;
  color: string;
  path: { lat: number; lng: number }[];
  stops: BusStop[];
}

// Realistic Nairobi bus routes following actual roads
export const nairobiRoutes: Route[] = [
  {
    id: 1,
    number: '46',
    name: 'CBD → Kawangware',
    color: '#3B82F6', // bright blue
    stops: [
      { name: 'Kencom', lat: -1.2864, lng: 36.8235 },
      { name: 'Kenyatta Ave', lat: -1.2878, lng: 36.8185 },
      { name: 'Uhuru Highway', lat: -1.2920, lng: 36.8155 },
      { name: 'Ngong Rd Junction', lat: -1.2980, lng: 36.8105 },
      { name: 'Prestige Plaza', lat: -1.3040, lng: 36.8045 },
      { name: 'Dagoretti Corner', lat: -1.3100, lng: 36.7985 },
      { name: 'Riruta', lat: -1.3150, lng: 36.7840 },
      { name: 'Kawangware', lat: -1.3158, lng: 36.7720 },
    ],
    path: [
      { lat: -1.2864, lng: 36.8235 },
      { lat: -1.2870, lng: 36.8210 },
      { lat: -1.2878, lng: 36.8185 },
      { lat: -1.2895, lng: 36.8165 },
      { lat: -1.2920, lng: 36.8155 },
      { lat: -1.2955, lng: 36.8130 },
      { lat: -1.2980, lng: 36.8105 },
      { lat: -1.3010, lng: 36.8075 },
      { lat: -1.3040, lng: 36.8045 },
      { lat: -1.3075, lng: 36.8010 },
      { lat: -1.3100, lng: 36.7985 },
      { lat: -1.3125, lng: 36.7955 },
      { lat: -1.3140, lng: 36.7920 },
      { lat: -1.3145, lng: 36.7880 },
      { lat: -1.3150, lng: 36.7840 },
      { lat: -1.3155, lng: 36.7800 },
      { lat: -1.3160, lng: 36.7760 },
      { lat: -1.3158, lng: 36.7720 },
    ]
  },
  {
    id: 2,
    number: '34',
    name: 'CBD → Kasarani',
    color: '#10B981', // emerald green
    stops: [
      { name: 'Tom Mboya St', lat: -1.2830, lng: 36.8260 },
      { name: 'Globe Roundabout', lat: -1.2785, lng: 36.8285 },
      { name: 'Pangani', lat: -1.2730, lng: 36.8305 },
      { name: 'Muthaiga Rdbt', lat: -1.2660, lng: 36.8338 },
      { name: 'Roysambu', lat: -1.2540, lng: 36.8390 },
      { name: 'TRM', lat: -1.2455, lng: 36.8425 },
      { name: 'Kasarani Stadium', lat: -1.2320, lng: 36.8490 },
      { name: 'Kasarani', lat: -1.2230, lng: 36.8530 },
    ],
    path: [
      { lat: -1.2830, lng: 36.8260 },
      { lat: -1.2810, lng: 36.8270 },
      { lat: -1.2785, lng: 36.8285 },
      { lat: -1.2760, lng: 36.8295 },
      { lat: -1.2730, lng: 36.8305 },
      { lat: -1.2695, lng: 36.8320 },
      { lat: -1.2660, lng: 36.8338 },
      { lat: -1.2620, lng: 36.8355 },
      { lat: -1.2580, lng: 36.8370 },
      { lat: -1.2540, lng: 36.8390 },
      { lat: -1.2500, lng: 36.8405 },
      { lat: -1.2455, lng: 36.8425 },
      { lat: -1.2410, lng: 36.8445 },
      { lat: -1.2365, lng: 36.8465 },
      { lat: -1.2320, lng: 36.8490 },
      { lat: -1.2275, lng: 36.8510 },
      { lat: -1.2230, lng: 36.8530 },
    ]
  },
  {
    id: 3,
    number: '15',
    name: 'CBD → Karen',
    color: '#F59E0B', // amber
    stops: [
      { name: 'Railway Station', lat: -1.2900, lng: 36.8225 },
      { name: 'Haile Selassie', lat: -1.2940, lng: 36.8190 },
      { name: 'Nyayo Stadium', lat: -1.3015, lng: 36.8130 },
      { name: 'T-Mall', lat: -1.3090, lng: 36.8090 },
      { name: 'Wilson Airport', lat: -1.3175, lng: 36.8035 },
      { name: 'Langata Rd', lat: -1.3265, lng: 36.7970 },
      { name: 'Galleria Mall', lat: -1.3380, lng: 36.7855 },
      { name: 'Karen Shopping Centre', lat: -1.3440, lng: 36.7740 },
    ],
    path: [
      { lat: -1.2900, lng: 36.8225 },
      { lat: -1.2920, lng: 36.8210 },
      { lat: -1.2940, lng: 36.8190 },
      { lat: -1.2960, lng: 36.8168 },
      { lat: -1.2985, lng: 36.8148 },
      { lat: -1.3015, lng: 36.8130 },
      { lat: -1.3050, lng: 36.8115 },
      { lat: -1.3090, lng: 36.8090 },
      { lat: -1.3130, lng: 36.8065 },
      { lat: -1.3175, lng: 36.8035 },
      { lat: -1.3220, lng: 36.8005 },
      { lat: -1.3265, lng: 36.7970 },
      { lat: -1.3310, lng: 36.7935 },
      { lat: -1.3350, lng: 36.7895 },
      { lat: -1.3380, lng: 36.7855 },
      { lat: -1.3400, lng: 36.7815 },
      { lat: -1.3420, lng: 36.7775 },
      { lat: -1.3440, lng: 36.7740 },
    ]
  },
  {
    id: 4,
    number: '108',
    name: 'CBD → Westlands',
    color: '#8B5CF6', // violet
    path: [
      // Start at CBD / University Way
      { lat: -1.2840, lng: 36.8220 },
      { lat: -1.2825, lng: 36.8200 },
      // Uhuru Highway north
      { lat: -1.2810, lng: 36.8180 },
      { lat: -1.2795, lng: 36.8165 },
      // Museum Hill
      { lat: -1.2775, lng: 36.8145 },
      { lat: -1.2755, lng: 36.8130 },
      // Chiromo Road
      { lat: -1.2735, lng: 36.8115 },
      { lat: -1.2715, lng: 36.8100 },
      // Waiyaki Way approach
      { lat: -1.2695, lng: 36.8085 },
      { lat: -1.2680, lng: 36.8065 },
      // Westlands
      { lat: -1.2665, lng: 36.8045 },
      { lat: -1.2650, lng: 36.8025 },
      { lat: -1.2635, lng: 36.8005 },
    ]
  }
];
