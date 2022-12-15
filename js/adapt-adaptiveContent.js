
import Backbone from 'backbone';
import Adapt from 'core/js/adapt';
import components from 'core/js/components';
import data from 'core/js/data';
import offlineStorage from 'core/js/offlineStorage';
import router from 'core/js/router';
import DiagnosticChoiceModel from './DiagnosticChoiceModel';
import DiagnosticChoiceView from './DiagnosticChoiceView';

class AdaptiveContent extends Backbone.Model {

  defaults() {
    return {
      _isEnabled: false,
      _shouldSubmitScore: true,
      _diagnosticAssessmentId: 'diagnostic',
      _finalAssessmentId: 'final',
      _passedRelatedTopicsBecome: 'unavailable',
      _diagnosticOptOut: null,
      _diagnosticChoice: {
        _onOptInNavigateTo: null,
        _onOptOutNavigateTo: null
      }
    };
  };

  initialize() {
    this.set({
      optional: [],
      unavailable: []
    });

    this.listenTo(Adapt, {
      'adapt:start': this.onAdaptStart
    });
  }

  // TODO need to check this with the language picker to see if it needs any additional work to reset on language change
  onAdaptStart() {
    this.set($.extend(true, this.defaults(), Adapt.course.get('_adaptiveContent')));

    if (!this.get('_isEnabled')) return;

    // check for stored data from a previous attempt
    const persistedData = offlineStorage.get('adaptiveContent');
    if (!persistedData) {
      // no previous attempt, wait for the learner to complete the diagnostic assessment
      this.listenTo(Adapt, 'assessments:complete', this.onDiagnosticAssessmentComplete);
      return;
    }

    // restore from suspend data
    this.restoreAdaptiveContent(persistedData);

    if (!this.get('_finalAssessmentId')) return;

    // course contains a final assessment, need to check if that needs to be handled or not
    const assessment = Adapt.assessment._assessments._byAssessmentId[this.get('_finalAssessmentId')];
    const assessmentContentObject = Adapt.findById(assessment.getState().pageId);
    if (assessmentContentObject.get('_isAvailable')) return;

    this.hideFinalAssessment(this.get('_finalAssessmentId'));
  }

  onDiagnosticAssessmentComplete(state) {
    console.log('onAssessmentComplete', state.isPass);

    if (state.id !== this.get('_diagnosticAssessmentId')) return;

    this.checkQuestions(state.questionModels);

    if (!state.isPass) {
      Adapt.trigger('diagnostic:complete', state);
      return;
    }

    this.hideFinalAssessment(this.get('_finalAssessmentId'));

    this.submitDiagnosticAssessmentScore(state);

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
  checkQuestions(questions) {
    // first, get a list of blocks (removing duplicates - blocks may have more than one question)
    const blocks = _.uniq(questions.map(question => question.getParent()));

    const relatedLearning = this.createRelatedLearningList(blocks);
    const passedRelatedLearningIds = this.getPassedRelatedLearningList(relatedLearning);
    const passedRelatedLearningModels = passedRelatedLearningIds.map(id => data.findById(id));

    switch (this.get('_passedRelatedTopicsBecome')) {
      case 'optional': return passedRelatedLearningModels.forEach(model => this.addToOptional(model));
      case 'unavailable': return passedRelatedLearningModels.forEach(model => this.addToUnavailable(model));
    }
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
  createRelatedLearningList(blocks) {
    const relatedLearning = {};
    blocks.forEach(block => {
      this.getRelatedLearningFromBlock(block, relatedLearning);
    });
    return relatedLearning;
  }

  getRelatedLearningFromBlock(block, relatedLearning) {
    const blockConfig = block.get('_adaptiveContent');

    if (_.isEmpty(blockConfig?._relatedTopics)) return relatedLearning;

    blockConfig._relatedTopics.forEach(id => {
      if (!relatedLearning[id]) relatedLearning[id] = [];
      relatedLearning[id].push(block);
    });
  }

  /**
   * Returns a list of all topics for which all associated questions were answered correctly.
   * @param {object} relatedLearning
   * @return {Array.<string>} An array of content object ids
   */
  getPassedRelatedLearningList(relatedLearning) {
    const list = [];
    _.each(relatedLearning, (blocks, contentObjectId) => {
      const allCorrect = blocks.every(block => this.areAllComponentsCorrect(block));
      if (allCorrect) list.push(contentObjectId);
    });

    return list;
  }

  areAllComponentsCorrect(block) {
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

  hideFinalAssessment(finalAssessmentId) {
    console.log('hideFinalAssessment', finalAssessmentId);
    if (!finalAssessmentId) return;

    const finalAssessment = Adapt.assessment._assessments._byAssessmentId[finalAssessmentId];
    if (!finalAssessment) {
      Adapt.log.warn('adaptiveContent: unable to find a final assessment with id "' + finalAssessmentId + '"!');
      return;
    }

    const finalAssessmentPage = data.findById(finalAssessment.getState().pageId);
    this.addToUnavailable(finalAssessmentPage);

    Adapt.config.get('_completionCriteria')._requireAssessmentCompleted = false;
  }

  submitDiagnosticAssessmentScore(assessmentState) {
    if (!this.get('_shouldSubmitScore')) return;

    if (assessmentState.isPercentageBased) {
      offlineStorage.set('score', assessmentState.scoreAsPercent, 0, 100);
      return;
    }

    offlineStorage.set('score', assessmentState.score, 0, assessmentState.maxScore);
  }

  restoreAdaptiveContent(persistedData) {
    this.set({
      optional: [],
      unavailable: [],
      ...persistedData
    });

    this.get('optional').forEach(id => {
      const model = data.findById(id);
      model.setOnChildren('_isOptional', true);
    });

    this.get('unavailable').forEach(id => {
      const model = data.findById(id);
      model.setOnChildren('_isAvailable', false);
    });
  }

  addToOptional(model) {
    const id = model.get('_id');
    const optional = this.get('optional');
    model.setOnChildren('_isOptional', true);
    if (optional.indexOf(id) >= 0) return;
    this.set('optional', optional.concat(id));
    this.persist();
  }

  addToUnavailable(model) {
    const id = model.get('_id');
    const unavailable = this.get('unavailable');
    model.setOnChildren('_isAvailable', false);
    if (unavailable.indexOf(id) >= 0) return;
    this.set('unavailable', unavailable.concat(id));
    this.persist();
  }

  diagnosticOptIn() {
    const diagnostic = Adapt.assessment.get(this.get('_diagnosticAssessmentId'));

    this.set('_diagnosticOptOut', false);
    diagnostic.setOnChildren('_isAvailable', true);

    this.optInNavigation();
  }

  diagnosticOptOut() {
    const diagnostic = Adapt.assessment.get(this.get('_diagnosticAssessmentId'));
    const diagnosticPage = diagnostic.getParent();

    this.set('_diagnosticOptOut', true);
    diagnosticPage.setOnChildren('_isAvailable', false);

    this.optOutNavigation();
  }

  optInNavigation() {
    const diagnosticChoiceCfg = this.get('_diagnosticChoice');

    if (diagnosticChoiceCfg._onOptInNavigateTo) {
      router.navigateToElement(diagnosticChoiceCfg._onOptInNavigateTo);
    }
  }

  optOutNavigation() {
    const diagnosticChoiceCfg = this.get('_diagnosticChoice');

    if (diagnosticChoiceCfg._onOptOutNavigateTo) {
      router.navigateToElement(diagnosticChoiceCfg._onOptOutNavigateTo);
    }
  }

  persist() {
    const optional = this.get('optional');
    const unavailable = this.get('unavailable');

    offlineStorage.set('adaptiveContent', { optional, unavailable });
    offlineStorage.save();
  }

}

components.register('diagnosticChoice', {
  model: DiagnosticChoiceModel,
  view: DiagnosticChoiceView
});

export default (Adapt.adaptiveContent = new AdaptiveContent());
