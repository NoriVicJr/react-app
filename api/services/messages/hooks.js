import auth from '@feathersjs/authentication';
import local from '@feathersjs/authentication-local';
import { restrictToOwner } from 'feathers-authentication-hooks';
import {
  fastJoin, disallow, iff, isProvider, keep
} from 'feathers-hooks-common';
import { required } from 'utils/validation';
import { validateHook as validate } from 'hooks';
import logger from 'utils/logger';

const schemaValidator = {
  text: required
};

function joinResolvers(context) {
  const { app } = context;
  const users = app.service('users');
  console.log('joinResolvers');

  return {
    joins: {
      author: () => async message => {
        const author = message.sentBy ? await users.get(message.sentBy) : null;
        message.author = author;
        return message;
      }
    }
  };
}

const joinAuthor = [
  fastJoin(joinResolvers, {
    author: true
  }),
  local.hooks.protect('author.password')
];

const messagesHooks = {
  before: {
    all: [logger()],
    find: [],
    get: [],
    create: [
      validate(schemaValidator),
      context => {
        const { data, params } = context;

        context.data = {
          text: data.text,
          sentBy: params.user ? params.user._id : null, // Set the id of current user
          createdAt: new Date()
        };
      }
    ],
    update: disallow(),
    patch: [
      auth.hooks.authenticate('jwt'),
      restrictToOwner({ ownerField: 'sentBy' }),
      // context => {console.log('isProvider', context.params.provider);}, // the next function is check this value
      iff(isProvider('external'), keep('text')),
      async context => {
        const { id, data, app } = context;
        const message = await app.service('messages').get(id);
        const history = message.history || [];
        history.push({ createdAt: message.updatedAt || message.createdAt, text: message.text });
        console.log(JSON.stringify(context, null, 2));
        context.data = {
          text: data.text,
          updatedAt: new Date(),
          history
        };
      }
    ],
    remove: disallow()
  },
  after: {
    // all: [logger()],
    find: joinAuthor,
    get: joinAuthor,
    create: joinAuthor,
    update: [],
    patch: joinAuthor.concat([
      context => {
        const { app, result } = context;
        app.service('messages').emit('patchedMessage', result);
      }
    ]),
    remove: []
  },
  error: {
    all: [logger()]
  }
};

export default messagesHooks;
