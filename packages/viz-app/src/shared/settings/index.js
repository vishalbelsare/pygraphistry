import compose from 'recompose/compose';
import withSettingsSchema from './schema';
import Option from './components/option';
import Options from './components/options';
import Settings from './components/settings';
import {
    withOptionContainer,
    withOptionsContainer,
    withSettingsContainer
} from './containers';

const OptionContainer = withOptionContainer(Option);
const OptionsContainer = withOptionsContainer(Options);
const SettingsContainer = compose(
    withSettingsSchema, withSettingsContainer
)(Settings);

export { OptionContainer as Option };
export { OptionsContainer as Options };
export { SettingsContainer as Settings };
