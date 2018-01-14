import { Legend } from './components/legend';
import { withLegendContainer, legendTabInteractions } from './containers';

export const LegendContainer = withLegendContainer(legendTabInteractions(Legend));
