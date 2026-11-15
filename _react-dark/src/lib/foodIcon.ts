/** Picks an illustration for a dish from its name, so every card has a picture without photos. */
const ART: [RegExp, string][] = [
  [/pizza|slice|calzone/, 'pizza'],
  [/burger/, 'burger'],
  [/taco/, 'taco'],
  [/burrito|wrap/, 'burrito'],
  [/salad|greens|kale|caesar/, 'salad'],
  [/pancake|waffle/, 'pancakes'],
  [/oat|cereal|granola|parfait|yogurt/, 'bowl'],
  [/omelet|scramble|egg/, 'egg'],
  [/toast|bagel|bread|sandwich|panini/, 'sandwich'],
  [/salmon|fish|tuna|lox/, 'fish'],
  [/shrimp|prawn/, 'shrimp'],
  [/chow mein|noodle|ramen|pasta|spaghetti|primavera|lo mein/, 'pasta'],
  [/chicken|turkey|wing/, 'chicken'],
  [/beef|steak|pork|sausage|bacon|brisket/, 'meat'],
  [/fried rice|rice|bowl|curry|stir.fry|teriyaki|bibimbap/, 'rice'],
  [/tofu|edamame|bean|lentil|chili|chickpea|falafel|hummus/, 'beans'],
  [/soup|stew|broth/, 'soup'],
  [/fries|chips|potato/, 'fries'],
  [/coffee|espresso|latte|cappuccino/, 'coffee'],
  [/tea/, 'tea'],
  [/juice|smoothie|soda|lemonade/, 'drink'],
  [/cookie|brownie|cake|dessert|ice cream/, 'cookie'],
  [/fruit|apple|banana|berry|berries/, 'apple'],
  [/vegetable|veggie|broccoli|spinach/, 'veg'],
]

/** Name of the illustration in src/assets/art that best fits a dish. */
export function foodIcon(name: string): string {
  const text = name.toLowerCase()
  return ART.find(([pattern]) => pattern.test(text))?.[1] ?? 'plate'
}
