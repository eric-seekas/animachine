import camelCase from 'lodash/string/camelCase'
import capitalize from 'lodash/string/capitalize'
import normalizeProjectTree from '../normalizeProjectTree'
import actions from '../actions'
import createItem from '../createItem'
import * as mandatoryParamGroups from './mandatoryParamGroups'
import history from './history'
import {
  getItemById,
  getKeyOfParamAtTime,
  getValueOfParamAtTime,
  getParamOfTrackByName,
  getKeysAtTime,
  collectSelectedKeys,
} from '../selectors'
import {
  recurseKeys,
  recurseParams,
} from '../utils'
import {
  setItem,
  addChild,
  removeChild,
  setValueOfParamAtTime,
} from './utils'

const rxSet = /^SET_([A-Z_]+?)_OF_([A-Z_]+?)$/
const rxAdd = /^ADD_([A-Z_]+?)_TO_([A-Z_]+?)$/
const rxRemove = /^REMOVE_([A-Z_]+?)_FROM_([A-Z_]+?)$/

const initialState = {
  currentProjectId: undefined,
  lastSelectedItemId: undefined,
  openedProjectIds: [],
  previewComponentsByProjectId: {},
  originalSourcesByProjectId: {},
  items: [],
}

export default function (projectManager = initialState, action) {
  return history(projectManager, action, reducer)
}

function reducer (projectManager, action) {
  const {type} = action
  switch (type) {
    case actions.OPEN_PROJECT: {
      const {items, projectId} = normalizeProjectTree(action.projectSource)
      console.log('OPEN_PROJECT', {items, projectId})
      return {
        ...projectManager,
        items: [
          ...projectManager.items,
          ...items
        ],
        openedProjectIds: [
          ...projectManager.openedProjectIds,
          projectId
        ],
        previewComponentsByProjectId: {
          ...projectManager.previewComponentsByProjectId,
          [projectId]: action.previewComponents
        },
        originalSourcesByProjectId: {
          ...projectManager.originalSourcesByProjectId,
          [projectId]: action.projectSource
        },
        currentProjectId: projectManager.currentProjectId || projectId
      }
    }
    case actions.SET_LAST_SELECTED_ITEM_ID: {
      return {
        ...projectManager,
        lastSelectedItemId: action.itemId
      }
    }
    case actions.SET_VALUE_OF_TRACK_AT_TIME: {
      const {value, trackId, paramName, time} = action
      let param = getParamOfTrackByName({trackId, paramName})

      if (param) {
        return setValueOfParamAtTime({
          projectManager,
          paramId: param.id,
          time,
          value
        })
      }
      else {
        const parentParamName = mandatoryParamGroups
          .getParentParamName(paramName)

        if (parentParamName) {
          const childParamNames = mandatoryParamGroups
            .getChildParamNames(parentParamName)
          const parentParam = createItem({
            type: 'param',
            data: {name: parentParamName}
          })

          projectManager = setItem({projectManager, item: parentParam})
          projectManager = addChild({
            projectManager,
            parentId: trackId,
            childId: parentParam.id,
            childrenKey: 'params'
          })

          childParamNames.forEach(childParamName => {
            let childParam = createItem({
              type: 'param',
              data: {name: childParamName}
            })
            projectManager = setItem({projectManager, item: childParam})
            projectManager = addChild({
              projectManager,
              parentId: parentParam.id,
              childId: childParam.id,
              childrenKey: 'params'
            })

            if (childParamName === paramName) {
              projectManager = setValueOfParamAtTime({
                projectManager,
                paramId: childParam.id,
                time,
                value
              })
            }
          })
        }
        else {
          param = createItem({
            type: 'param',
            data: {name: paramName}
          })
          projectManager = setItem({projectManager, item: param})
          projectManager = addChild({
            projectManager,
            parentId: trackId,
            childId: param.id,
            childrenKey: 'params'
          })
        }
      }

      return projectManager
    }
    case actions.SET_VALUE_OF_PARAM_AT_TIME: {
      const {value, paramId, time} = action
      return setValueOfParamAtTime({projectManager, value, paramId, time})
    }
    case actions.TOGGLE_KEYS_AT_TIME: {
      const {keyHolderId, time} = action
      const isEndParam = param => param.params.length === 0
      let allHasKey = true

      recurseParams({keyHolderId, callback: param => {
        const key = getKeyOfParamAtTime({paramId: param.id, time})
        if (isEndParam(param) && !key) {
          allHasKey = false
        }
      }})

      recurseParams({keyHolderId, callback: param => {
        if (isEndParam(param)) {
          if (allHasKey) {
            const key = getKeyOfParamAtTime({paramId: param.id, time})
            return removeChild({
              projectManager,
              parentId: param.id,
              childId: key.id,
              childrenKey: 'keys'
            })
          }
          else {
            const value = getValueOfParamAtTime({paramId: param.id, time})
            return setValueOfParamAtTime({
              projectManager,
              value,
              paramId: param.id,
              time,
            })
          }
        }
      }})
    }
    case actions.TOGGLE_KEYS_SELECTION_AT_TIME: {
      const {keyHolderId, time} = action
      const keysAtTime = getKeysAtTime({keyHolderId, time})
      const selected = keysAtTime.some(key => !key.selected)
      keysAtTime.forEach(key => {
        projectManager = setItem({projectManager, item: {...key, selected}})
      })
      return projectManager
    }
    case actions.SELECT_KEYS_AT_TIME: {
      const {keyHolderId, time} = action
      const keysAtTime = getKeysAtTime({keyHolderId, time})
      keysAtTime.forEach(key => {
        const item = {...key, selected: true}
        projectManager = setItem({projectManager, item})
      })
      return projectManager
    }
    case actions.DESELECT_ALL_KEYS: {
      const {keyHolderId} = action
      recurseKeys({keyHolderId, callback: key => {
        if (key.selected) {
          const item = {...key, selected: false}
          projectManager = setItem({projectManager, item})
        }
      }})
      return projectManager
    }
    case actions.TRANSLATE_SELECTED_KEYS: {
      const {keyHolderId, offset} = action
      collectSelectedKeys({keyHolderId}).forEach(key => {
        const time = key.time + offset
        projectManager = setItem({projectManager, item: {...key, time}})
      })
      return projectManager
    }
    case actions.DELETE_SELECTED_KEYS: {
      const {keyHolderId} = action
      collectSelectedKeys({keyHolderId}).forEach(key => {
        const param = getParentParamOfKey({keyId: key.id})
        projectManager = removeChild({
          projectManager,
          parentId: param.id,
          childId: key.id,
          childrenKey: 'keys',
        })
        projectManager = removeItem({projectManager, item: key})
      })
      return projectManager
    }
    case actions.SET_VISIBLE_TIME_OF_TIMELINE: {
      const {timelineId, visibleTime} = action
      const timeline = getItemById({id: timelineId})
      return setItem({
        projectManager,
        item: {
          ...timeline,
          pxpms: timeline.width / visibleTime
        }
      })
    }
    case actions.ADD_TIMELINE_TO_PROJECT:
    case actions.ADD_TRACK_TO_TIMELINE:
    case actions.ADD_PARAM_TO_TRACK:
    case actions.ADD_PARAM_TO_PARAM:
    case actions.ADD_KEY_TO_PARAM:
    case actions.ADD_SELECTOR_TO_TRACK:
    case actions.ADD_SELECTOR_COMMAND_TO_SELECTOR:
    case actions.ADD_SELECTOR_COMMAND_PARAM_TO_SELECTOR_COMMAND:
    {
      const [childType, targetKey] = type
        .match(rxAdd)
        .slice(1, 3)
        .map(camelCase)
      const targetItem = getItemById({id: action[`${targetKey}Id`]})
      const childItem = createItem({type: childType})

      projectManager = setItem({projectManager, item: childItem})
      return addChild({
        projectManager,
        childId: childItem.id,
        parentId: targetItem.id,
        childrenKey: `${childType}s`
      })
    }
    case actions.REMOVE_TIMELINE_FROM_PROJECT:
    case actions.REMOVE_TRACK_FROM_TIMELINE:
    case actions.REMOVE_PARAM_FROM_TRACK:
    case actions.REMOVE_PARAM_FROM_PARAM:
    case actions.REMOVE_KEY_FROM_PARAM:
    case actions.REMOVE_SELECTOR_FROM_TRACK:
    case actions.REMOVE_SELECTOR_COMMAND_FROM_SELECTOR:
    case actions.REMOVE_SELECTOR_COMMAND_PARAM_FROM_SELECTOR_COMMAND:
    {
      const [childType, targetKey] = type
        .match(rxRemove)
        .slice(1, 3)
        .map(camelCase)
      const targetItem = getItemById({id: action[`${targetKey}Id`]})
      const childItem = getItemById({
        id: action[`child${capitalize(childType)}Id`]
      })

      projectManager = setItem({projectManager, item: childItem})
      return removeChild({
        projectManager,
        childId: childItem.id,
        parentId: targetItem.id,
        childrenKey: `${childType}s`
      })
    }
  }

  if (rxSet.test(type)) {
    const [valueKey, targetKey] = type.match(rxSet).slice(1, 3).map(camelCase)
    const item = getItemById({id: action[`${targetKey}Id`]})
    return setItem({
      projectManager,
      item: {
        ...item,
        [valueKey]: action[valueKey]
      }
    })
  }

  return projectManager
}
