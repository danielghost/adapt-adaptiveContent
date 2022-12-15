## UPDATE: a new version of this plugin has been developed and will appear here soon.

# Adaptive content extension

## Overview
The purpose of this extension is to allow the content of the course to be tailored to the learner's knowledge of the subject matter.

This is achieved by requiring the learner to sit an up-front assessment - referred to as the 'diagnostic assessment' so as to differentiate it from the final assessment (where used) - successfully answering questions in this assessment causes content to be removed from the learner journey.

Additionally, if the course contains a final assessment, the learner will not be required to sit it if they pass the diagnostic assessment.

It is therefore possible for a learner who gets a perfect score in the diagnostic assessment to 'test out' of all the content, with nothing further to do. Equally it is possible to include _mandatory content_ in the course, which all learners must complete - even those who get a perfect score in the diagnostic assessment.

## Usage

The blocks containing questions in this introductory 'diagnostic assessment' are given a new property to link them to target content objects by adding the following to the relevant entries in `blocks.json`:
```
"_adaptiveContent": {
    "_relatedTopics": [
        "co-05"
    ]
}
```
Or, if you want more than one content object to be associated to the question(s) in the block:
```
"_adaptiveContent": {
    "_relatedTopics": [
        "co-05",
        "co-10
    ]
}
```
You can link a content object to multiple blocks of questions. This allows you to use both 'question randomisation' and 'question banking' in the diagnostic assessment - just like you can in a regular assessment.

If the user correctly answers completes all questions associated with a particular content object, that content object will be removed from the learner journey by setting `_isAvailable` to `false`.

If a content object is not associated with any of the questions in the diagnostic assessment, it will be considered _mandatory content_ i.e. all users will need to complete it to complete the course, regardless of how well they perform in the diagnostic assessment

The main configuration for this extension is in `course.json`:
```
"_adaptiveContent": {
    "_isEnabled": true,
    "_shouldSubmitScore": true,
    "_diagnosticAssessmentId": "diagnostic",
    "_finalAssessmentId": "final"
}
```
If `_shouldSubmitScore` is set to `true`, the score the learner attains in the diagnostic assessment will be reported to the LMS. Note that, if the course contains a final assessment, and the learner is required to complete that, the score for the final assessment will overwrite any score recording from their attempt at the diagnostic assessment. This is because SCORM only allows for one score per SCO to be recorded.

The setting `_diagnosticAssessmentId` is the 'assessment ID' of the diagnostic assessment. This setting is mandatory. If the course includes a final assessment, you must set `_finalAssessmentId` to the 'assessment ID' of the final assessment. These settings are vital to allow the extension to know which assessment is which!

## Learner Journey Scenarios

The following scenarios are all supported by this extension

### No final assessment, no mandatory content

|Diagnostic Assessment Result|Learner Journey Outcome|
|------|------|
|Fail|All content objects related to failed blocks must be completed|
|Pass|All content objects related to failed blocks must be completed|
|Perfect|Course marked as complete|

### No final assessment,  mandatory content

|Diagnostic Assessment Result|Learner Journey Outcome|
|------|------|
|Fail|All content objects related to failed blocks & mandatory content must be completed|
|Pass|All content objects related to failed blocks & mandatory content must be completed|
|Perfect|All mandatory content must be completed|

### Final assessment, no mandatory content

|Diagnostic Assessment Result|Learner Journey Outcome|
|------|------|
|Fail|All content objects related to failed blocks & final assessment must be completed|
|Pass|Final assessment disabled. All content objects related to failed blocks must be completed.|
|Perfect|Final assessment disabled. Course marked as complete.|

### Final assessment, mandatory content

|Diagnostic Assessment Result|Learner Journey Outcome|
|------|------|
|Fail|All content objects related to failed blocks, mandatory content & final assessment must be completed|
|Pass|Final assessment disabled. All content objects related to failed blocks & mandatory content must be completed.|
|Perfect|Final assessment disabled. All mandatory content must be completed.|

## Diagnostic assessment configuration notes
The diagnostic assessment functionality is handled entirely by the standard [adapt assessment extension](https://github.com/adaptlearning/adapt-contrib-assessment). However, there are some configuration options that need to be set correctly for it to be able to function as a 'diagnostic assessment'...

The diagnostic assessment **must**:
* use the [adapt-diagnosticResults](https://github.com/cgkineo/adapt-diagnosticResults) component to show its results, rather than the standard adapt-contrib-assessmentResults component!
* be set to 1 attempt only (set `_attempts` to `1`)
* have `_isResetOnRevisit` set to `false`
* have `_includeInTotalScore` set to `false`
* have **all** blocks within the assessment associated with _at least_ one content object

## Course configuration notes
Similarly there's a few settings in config.json that need to be set correctly in order for all this to work.
* In the `_completionCriteria` section, the setting `_requireContentCompleted` must **always** be set to `true`. If the course is also to contain a final assessment (which the learner is required to be pass should the fail the diagnostic assessment), you should also set `_requireAssessmentCompleted` to `true`. The adaptive content extension will handle setting this to `false` if the diagnostic assessment is passed (and the learner therefore is not required to sit a final assessment)
* In the `_tracking` section of the `_spoor` configuration, `_shouldStoreResponses` needs to be set to `true` so as to prevent the learner from resetting the diagnostic assessment by quitting the course and relaunching.
