import { Observable } from 'rxjs';
import { WithContext as ReactTags } from 'react-tag-input';
import mapPropsStream from 'recompose/mapPropsStream';
import createEventHandler from 'recompose/createEventHandler';

const HandleTagUpdates = mapPropsStream(propsStream => {
  const { handler: drag, stream: drags } = createEventHandler();
  const { handler: push, stream: pushes } = createEventHandler();
  const { handler: splice, stream: splices } = createEventHandler();

  const updates = Observable.merge(drags.debounceTime(1000), pushes, splices);
  const handleAddition = tag =>
    push({
      type: 'push',
      tag
    });
  const handleDelete = index =>
    splice({
      type: 'splice',
      index
    });
  const handleDrag = (tag, index, newIndex) =>
    drag({
      type: 'drag',
      tag,
      index,
      newIndex
    });

  return propsStream.switchMap(({ tags = [], ...props }) => {
    const { setInvestigationParams, investigationId } = props;

    return updates
      .map(mapTagUpdates)
      .startWith(tags)
      .map(mapTagsToProps);

    function mapTagUpdates({ tag, type, index, newIndex }) {
      if (type === 'push') {
        tags.push({ text: tag, id: tags.length + 1 });
      } else if (type === 'splice') {
        tags.splice(index, 1);
      } else if (type === 'drag') {
        tags.splice(index, 1);
        tags.splice(newIndex, 0, tag);
      }

      setInvestigationParams(
        {
          tags: tags.map(({ text }) => text)
        },
        investigationId
      );

      return tags;
    }

    function mapTagsToProps(tags) {
      return {
        ...props,
        tags,
        handleDrag,
        handleDelete,
        handleAddition
      };
    }
  });
});

function InvestigationTags({
  tags = [],
  autoFocus = false,
  handleDrag,
  handleDelete,
  handleAddition
}) {
  return (
    <ReactTags
      tags={tags}
      autofocus={autoFocus}
      handleDrag={handleDrag}
      handleDelete={handleDelete}
      handleAddition={handleAddition}
    />
  );
}

export default HandleTagUpdates(InvestigationTags);
