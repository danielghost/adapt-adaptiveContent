import React, { useState, useEffect } from 'react';
import Data from 'core/js/data';

// listen for any changes to a given model
export function useModel(idOrModel) {
  const model = idOrModel instanceof Backbone.Model ? idOrModel : Data.findById(idOrModel);
  const [data, setData] = useState(model?.toJSON());

  useEffect(() => {
    if (!model) return;

    setData(model.toJSON());

    const onData = () => setData(model.toJSON());

    model.on('change', onData);

    return () => model.off('change', onData);
  }, [Data, idOrModel]);

  return data;
}

// listen for a specific change to a given model
export function useModelProp(idOrModel, prop, callback) {
  const model = idOrModel instanceof Backbone.Model ? idOrModel : Data.findById(idOrModel);
  const [data, setData] = useState(model?.get(prop));

  useEffect(() => {
    if (!model) return;

    setData(model?.get(prop));

    const onChangeProp = (_, val) => { setData(val); callback?.(val); };

    model.on(`change:${prop}`, onChangeProp);

    return () => model.off(`change:${prop}`, onChangeProp);
  }, [Data, idOrModel, prop, callback]);

  return data;
}
