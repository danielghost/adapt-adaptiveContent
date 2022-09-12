define([
  'core/js/adapt'
], function(Adapt) {

  // TODO need to check this with the language picker to see if it needs any additional work to reset on language change
  Adapt.on('adapt:start', function initAdaptiveContentPlugin() {
    const courseConfig = Adapt.course.get('_adaptiveContent');

    if (!courseConfig || !courseConfig._isEnabled) return;

    // check for stored data from a previous attempt
    const adaptiveContent = Adapt.offlineStorage.get('adaptiveContent');
    if (!adaptiveContent) {
      // no previous attempt, wait for the learner to complete the diagnostic assessment
      Adapt.on('assessments:complete', onDiagnosticAssessmentComplete);
      return;
    }

    // restore from suspend data
    checkContentStatusSetting(adaptiveContent, false);

    if (!courseConfig._finalAssessmentId) return;

    // course contains a final assessment, need to check if that needs to be handled or not
    const assessment = Adapt.assessment._assessments._byAssessmentId[courseConfig._finalAssessmentId];
    const assessmentContentObject = Adapt.findById(assessment.getState().pageId);
    if (assessmentContentObject.get('_isAvailable')) return;

    hideFinalAssessment(courseConfig._finalAssessmentId, false);
  });

  function onDiagnosticAssessmentComplete(state) {
    console.log('onAssessmentComplete', state.isPass);
    const config = Adapt.course.get('_adaptiveContent');

    if (state.id !== config._diagnosticAssessmentId) return;

    checkQuestions(state.questionModels);

    if (!state.isPass) {
      Adapt.trigger('diagnostic:complete', state);
      return;
    }

    hideFinalAssessment(config._finalAssessmentId, true);

    submitDiagnosticAssessmentScore(state);

    Adapt.trigger('diagnostic:complete', state);

    // defer to give the diagnostic results component time to receive and process the above event
    _.defer(() => Adapt.course.checkCompletionStatus());
  }

  /**
   * Loops through the questions that were actually part of the diagnostic assessment
   * (as content author could have enabled either banking or randomisation we can't assume
   * they'll all be included)
   * Use that to create a list of related learning topics
   * Then check that list to see if all questions associated with it were answered correctly
   * @param {Backbone.Collection} questions Collection of questionModels
   */
  function checkQuestions(questions) {
    // first, get a list of blocks (removing duplicates - blocks may have more than one question)
    const blocks = _.uniq(questions.map(question => question.getParent()));

    const relatedLearning = createRelatedLearningList(blocks);
    const unavailableRelatedLearning = getUnavailableRelatedLearningList(relatedLearning);

    checkContentStatusSetting(unavailableRelatedLearning, true);
  }

  /**
   * This extension has been set up in a way that's easiest for a content author to work with i.e. by associating
   * 'related learning' topics with blocks... but for our purposes we really need it the other way round
   * i.e. which blocks are associated with which related learning topics. So this function and `getRelatedLearningFromBlock`
   * handles that work, creating an object like this:
   * ```
   * {
   *      "c-05": [
   *          "b-05",
   *          "b-10"
   *      ]
   * },
   * {
   *      "c-10": [
   *          "b-05",
   *          "b-15"
   *      ]
   *  }```
   * Making it easier to check if, for any given related learning topic, whether all questions associated with it have been
   * answered correctly or not (via `areAllComponentsCorrect`)
   * @param {Array.<Backbone.Model>} blocks
   * @return {object}
   */
  function createRelatedLearningList(blocks) {
    const relatedLearning = {};
    blocks.forEach(block => {
      getRelatedLearningFromBlock(block, relatedLearning);
    });
    return relatedLearning;
  }

  function getRelatedLearningFromBlock(block, relatedLearning) {
    const config = block.get('_adaptiveContent');
    if (!config || !config._relatedTopics || config._relatedTopics.length < 1) return relatedLearning;

    config._relatedTopics.forEach(id => {
      if (!relatedLearning[id]) relatedLearning[id] = [];
      relatedLearning[id].push(block);
    });
  }

  /**
   * Creates a list of 'related learning to make unavaialable' by going through the related learning list
   * checking to see if every question associated with it was answered correctly. If so, it's added to the list.
   * @param {object} relatedLearning
   * @return {Array.<string>} An array of content object ids
   */
  function getUnavailableRelatedLearningList(relatedLearning) {
    const unavailableList = [];
    _.each(relatedLearning, (blocks, contentObjectId) => {
      const allCorrect = blocks.every(block => areAllComponentsCorrect(block));
      if (allCorrect) unavailableList.push(contentObjectId);
    });

    return unavailableList;
  }

  function areAllComponentsCorrect(block) {
    if (block.has('_allComponentsCorrect')) { // if we've checked this block before, used the cached result to save time
      return block.get('_allComponentsCorrect');
    }

    const components = block.get('_children');
    const status = [];

    components.models.forEach(component => {
      if (!component.get('_isQuestionType')) return;
      status.push(component.get('_isCorrect'));
    });

    if (status.length === 0) {
      block.set('_allComponentsCorrect', false);
      return false;
    }

    const allCorrect = status.every(isCorrect => isCorrect);
    block.set('_allComponentsCorrect', allCorrect);
    return allCorrect;
  }

  function hideFinalAssessment(finalAssessmentId, saveChanges) {
    console.log('hideFinalAssessment', finalAssessmentId, saveChanges);
    if (!finalAssessmentId) return;

    const finalAssessment = Adapt.assessment._assessments._byAssessmentId[finalAssessmentId];
    if (!finalAssessment) {
      Adapt.log.warn('adaptiveContent: unable to find a final assessment with id "' + finalAssessmentId + '"!');
      return;
    }

    const finalAssessmentPageID = finalAssessment.getState().pageId;

    if (Adapt.course.get('_adaptiveContent')._setPageStatusAs === 'unavailable') {
      checkContentStatusSetting([finalAssessmentPageID], saveChanges);
    };

    Adapt.config.get('_completionCriteria')._requireAssessmentCompleted = false;
  }

  function submitDiagnosticAssessmentScore(assessmentState) {
    if (!Adapt.course.get('_adaptiveContent')._shouldSubmitScore) return;

    if (assessmentState.isPercentageBased) {
      Adapt.offlineStorage.set('score', assessmentState.scoreAsPercent, 0, 100);
      return;
    }

    Adapt.offlineStorage.set('score', assessmentState.score, 0, assessmentState.maxScore);
  }

  function checkContentStatusSetting(ids, saveChanges) {
    if (!ids || ids.length === 0) return;
    const statusOption = Adapt.course.get('_adaptiveContent')._setPageStatusAs;
    const logName = `setAs${statusOption[0].toUpperCase()}${statusOption.substring(1)}`;
    console.log(logName, ids, saveChanges);
    ids.forEach(id => {
      const model = Adapt.findById(id);
      if (!model) return;
      switch (statusOption) {
        case 'unavailable':
          model.setOnChildren('_isAvailable', false);
          break;
        case 'optional':
          model.setOnChildren('_isOptional', true);
          model.set('_classes', model.get('_classes') + ' diag-optional');
          break;
        case 'complete':
          model.setOnChildren({
            _isLocked: false,
            _isComplete: true,
            _isInteractionComplete: true
          });
          model.set('_classes', model.get('_classes') + ' diag-complete');
          break;
      }
    });
    if (saveChanges) saveToOfflineStorage(ids);
  }

  function saveToOfflineStorage(contentObjectIds) {
    const adaptiveContent = Adapt.offlineStorage.get('adaptiveContent') || [];
    contentObjectIds.forEach(id => {
      if (adaptiveContent.includes(id)) return;
      adaptiveContent.push(id);
    });

    console.log('saveToOfflineStorage', adaptiveContent);
    Adapt.offlineStorage.set('adaptiveContent', adaptiveContent);
    Adapt.offlineStorage.save();
  }
});
