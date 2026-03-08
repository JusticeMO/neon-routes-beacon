export interface Route {
  id: number;
  number: string;
  name: string;
  color: string;
  path: { lat: number; lng: number }[];
}

// Realistic Nairobi bus routes following actual roads
export const nairobiRoutes: Route[] = [
  {
    id: 1,
    number: '46',
    name: 'CBD → Kawangware',
    color: '#3B82F6', // bright blue
    path: [
      // Start at Kencom/CBD
      { lat: -1.2864, lng: 36.8235 },
      // Along Kenyatta Avenue
      { lat: -1.2870, lng: 36.8210 },
      { lat: -1.2878, lng: 36.8185 },
      // Turn onto Uhuru Highway
      { lat: -1.2895, lng: 36.8165 },
      { lat: -1.2920, lng: 36.8155 },
      // Along Ngong Road
      { lat: -1.2955, lng: 36.8130 },
      { lat: -1.2980, lng: 36.8105 },
      { lat: -1.3010, lng: 36.8075 },
      { lat: -1.3040, lng: 36.8045 },
      // Ngong Rd continues
      { lat: -1.3075, lng: 36.8010 },
      { lat: -1.3100, lng: 36.7985 },
      { lat: -1.3125, lng: 36.7955 },
      // Turn onto Kawangware Road
      { lat: -1.3140, lng: 36.7920 },
      { lat: -1.3145, lng: 36.7880 },
      { lat: -1.3150, lng: 36.7840 },
      // Kawangware area
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
    path: [
      // Start at CBD / Tom Mboya Street
      { lat: -1.2830, lng: 36.8260 },
      { lat: -1.2810, lng: 36.8270 },
      // Along Murang'a Road
      { lat: -1.2785, lng: 36.8285 },
      { lat: -1.2760, lng: 36.8295 },
      { lat: -1.2730, lng: 36.8305 },
      // Thika Road begins
      { lat: -1.2695, lng: 36.8320 },
      { lat: -1.2660, lng: 36.8338 },
      { lat: -1.2620, lng: 36.8355 },
      { lat: -1.2580, lng: 36.8370 },
      // Thika Superhighway
      { lat: -1.2540, lng: 36.8390 },
      { lat: -1.2500, lng: 36.8405 },
      { lat: -1.2455, lng: 36.8425 },
      { lat: -1.2410, lng: 36.8445 },
      // Kasarani area
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
    path: [
      // Start at Railway Station area
      { lat: -1.2900, lng: 36.8225 },
      { lat: -1.2920, lng: 36.8210 },
      // Haile Selassie Avenue
      { lat: -1.2940, lng: 36.8190 },
      { lat: -1.2960, lng: 36.8168 },
      // Onto Uhuru Highway south
      { lat: -1.2985, lng: 36.8148 },
      { lat: -1.3015, lng: 36.8130 },
      // Langata Road
      { lat: -1.3050, lng: 36.8115 },
      { lat: -1.3090, lng: 36.8090 },
      { lat: -1.3130, lng: 36.8065 },
      { lat: -1.3175, lng: 36.8035 },
      { lat: -1.3220, lng: 36.8005 },
      // Continue on Langata Rd
      { lat: -1.3265, lng: 36.7970 },
      { lat: -1.3310, lng: 36.7935 },
      { lat: -1.3350, lng: 36.7895 },
      // Karen Road junction
      { lat: -1.3380, lng: 36.7855 },
      { lat: -1.3400, lng: 36.7815 },
      // Karen Shopping Centre area
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
