import compose from 'recompose/compose';
import templateSchema from './schema';
import templateContainer from './container';

const TemplateContainer = compose(templateContainer, templateSchema)(
    () => /* nothing to render */ null
);

export { TemplateContainer as Template };
