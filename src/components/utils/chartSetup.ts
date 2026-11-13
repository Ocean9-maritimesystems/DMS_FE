/**
 * Registers every Chart.js chart type, scale and element once, before any chart is drawn.
 *
 * The dashboard charts used to rely on luck: the Circulars chart registered only some elements and no chart types,
 * and worked only because PrimeReact's Chart (on the Manuals tab) loads 'chart.js/auto' in the background, which
 * registers everything. In the built site that did not happen in time, the first chart threw
 * '"bar" is not a registered controller', and the whole page went blank.
 */
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export {};
