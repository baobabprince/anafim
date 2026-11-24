// Inline the licensed fonts so downloaded SVGs and offline builds are self-contained.
import regular from '../public/fonts/heebo-400.ttf?inline';
import bold from '../public/fonts/heebo-600.ttf?inline';
import license from '../licenses/Heebo-OFL.txt?raw';
export const chartFonts = { regular, bold, license };
