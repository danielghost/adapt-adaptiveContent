import ComponentView from 'core/js/views/componentView';

class DiagnosticChoiceView extends ComponentView {

  postRender() {
    this.setReadyStatus();
    this.setupInview();
  }

  setupInview() {
    const selector = this.getInviewElementSelector();
    if (!selector) return this.setCompletionStatus();
    this.setupInviewCompletion(selector);
  }

  /**
   * determines which element should be used for inview logic - body, instruction or title - and returns the selector for that element
   */
  getInviewElementSelector() {
    if (this.model.get('body')) return '.component__body';
    if (this.model.get('instruction')) return '.component__instruction';
    if (this.model.get('displayTitle')) return '.component__title';
    return null;
  }

}

DiagnosticChoiceView.template = 'diagnosticChoice.jsx';

export default DiagnosticChoiceView;
