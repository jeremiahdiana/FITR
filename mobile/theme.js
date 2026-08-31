export const colors = {
  // Backgrounds
  bg:         '#ffffff',
  bgSection:  '#F7F8FA',
  bgPanel:    '#F2F4F7',
  bgInput:    '#F0F2F5',
  bgCard:     '#ffffff',

  // Brand — teal used ONLY for CTAs, active states, key highlights
  brand:      '#00C9A7',
  brandLight: 'rgba(0,201,167,0.10)',

  // Text
  text:       '#111111',
  textSub:    '#444444',
  textMuted:  '#777777',
  textDim:    '#AAAAAA',

  // Borders
  border:      '#E8EAED',
  borderLight: '#F0F2F5',

  // Semantic
  sale:       '#C0392B',   // muted red (less harsh than #e63946)
  saleBg:     '#FDF0EE',
  star:       '#F5A623',
  verified:   '#00C9A7',

  white: '#ffffff',
};

// 8pt spacing grid — use ONLY these values
export const sp = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

// Consistent border radii
export const r = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 999,
};

// Reusable shadow
export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
};

// Typography scale
export const type = {
  sectionTitle:  { fontSize: 21, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  productName:   { fontSize: 14, fontWeight: '500', color: colors.text, lineHeight: 19 },
  productBrand:  { fontSize: 11, fontWeight: '500', color: colors.textMuted },
  price:         { fontSize: 17, fontWeight: '800', color: colors.text },
  priceOld:      { fontSize: 13, fontWeight: '400', color: colors.textDim, textDecorationLine: 'line-through' },
  secondary:     { fontSize: 13, color: colors.textMuted },
  caption:       { fontSize: 11, color: colors.textDim },
};
