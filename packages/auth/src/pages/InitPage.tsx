/** @jsxRuntime classic */
/** @jsx jsx */

import { useMemo, useState } from 'react';
import fetch from 'cross-fetch';

import { jsx, H1, Stack, Inline, VisuallyHidden } from '@keystone-ui/core';
import { Button } from '@keystone-ui/button';
import { Checkbox, TextInput } from '@keystone-ui/fields';
import { FieldMeta } from '@keystone-6/core/types';
import isDeepEqual from 'fast-deep-equal';

import { gql, useMutation } from '@keystone-6/core/admin-ui/apollo';
import { useReinitContext, useKeystone } from '@keystone-6/core/admin-ui/context';
import { useRouter, Link } from '@keystone-6/core/admin-ui/router';
import { GraphQLErrorNotice } from '@keystone-6/core/admin-ui/components';
import {
  Fields,
  serializeValueToObjByFieldKey,
  useInvalidFields,
} from '@keystone-6/core/admin-ui/utils';
import { guessEmailFromValue, validEmail } from '../lib/emailHeuristics';
import { IconTwitter, IconGithub } from '../components/Icons';
import { SigninContainer } from '../components/SigninContainer';
import { useRedirect } from '../lib/useFromRedirect';

const signupURL = 'https://signup.keystonejs.cloud/api/newsletter-signup';

function Welcome({ value, onContinue }: { value: any; onContinue: () => void }) {
  const [subscribe, setSubscribe] = useState(false);
  const [email, setEmail] = useState<string>(guessEmailFromValue(value));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    // Check if user wants to subscribe and a valid email address
    if (subscribe) {
      setLoading(true);

      if (!validEmail(email)) {
        setError('Email is invalid');
        return;
      }

      const res = await fetch(signupURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: value.username,
          email,
          source: '@keystone-6/auth InitPage',
        }),
      });

      try {
        if (res.status !== 200) {
          const { error } = await res.json();
          setError(error);
          return;
        }
      } catch (e: any) {
        // network errors or failed parse
        setError(e.message.toString());
        return;
      }

      setLoading(false);
    }

    onContinue();
  };

  return (
    <Stack gap="large">
      <Stack
        gap="small"
        align="center"
        across
        css={{
          width: '100%',
          justifyContent: 'space-between',
        }}
      >
        <H1>Welcome</H1>
        <Stack across gap="small">
          <IconTwitter title="Twitter Logo" />
          <IconGithub
            href="https://github.com/keystonejs/keystone"
            target="_blank"
            title="Github"
          />
        </Stack>
      </Stack>

      <p css={{ margin: 0 }}>
        Thanks for installing KeystoneJS. While you're getting started, check out the docs at{' '}
        <a href="https://keystonejs.com">keystonejs.com</a>
      </p>
      <div>
        If you'd like to stay up to date with the exciting things we have planned, join our mailing
        list (just useful announcements, no spam!)
      </div>
      <div>
        <Checkbox
          checked={subscribe}
          onChange={() => {
            setError(null);
            setSubscribe(!subscribe);
          }}
        >
          sign up to our mailing list
        </Checkbox>
      </div>
      <form onSubmit={onSubmit}>
        <VisuallyHidden as="label" htmlFor="email-field">
          Email Address
        </VisuallyHidden>
        <TextInput
          id="email-field"
          disabled={!subscribe}
          autoFocus
          placeholder={'Email'}
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <p css={{ color: 'red' }}>{error}</p>
        <Inline gap="medium" align="center">
          <Button isLoading={loading} type={'submit'} weight="bold" tone="active">
            {error ? 'Try again' : 'Continue'}
          </Button>
          {error && (
            <Button as={Link} href={'/'} tone="active">
              Continue
            </Button>
          )}
        </Inline>
      </form>
    </Stack>
  );
}

type InitPageProps = {
  listKey: string;
  fieldPaths: string[];
  enableWelcome: boolean;
};

function InitPage({ fieldPaths, listKey, enableWelcome }: InitPageProps) {
  const { adminMeta } = useKeystone();
  const fields = useMemo(() => {
    const fields: Record<string, FieldMeta> = {};
    fieldPaths.forEach(fieldPath => {
      fields[fieldPath] = adminMeta.lists[listKey].fields[fieldPath];
    });
    return fields;
  }, [fieldPaths, adminMeta.lists, listKey]);

  const [value, setValue] = useState(() => {
    let state: Record<string, any> = {};
    Object.keys(fields).forEach(fieldPath => {
      state[fieldPath] = { kind: 'value', value: fields[fieldPath].controller.defaultValue };
    });
    return state;
  });

  const invalidFields = useInvalidFields(fields, value);
  const [forceValidation, setForceValidation] = useState(false);
  const [mode, setMode] = useState<'init' | 'welcome'>('init');

  const [createFirstItem, { loading, error, data }] =
    useMutation(gql`mutation($data: CreateInitial${listKey}Input!) {
    authenticate: createInitial${listKey}(data: $data) {
      ... on ${listKey}AuthenticationWithPasswordSuccess {
        item {
          id
        }
      }
    }
  }`);
  const reinitContext = useReinitContext();
  const router = useRouter();
  const redirect = useRedirect();

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    // Check if there are any invalidFields
    const newForceValidation = invalidFields.size !== 0;
    setForceValidation(newForceValidation);

    // if yes, don't submit the form
    if (newForceValidation) return;

    // If not we serialize the data
    const data: Record<string, any> = {};
    const allSerializedValues = serializeValueToObjByFieldKey(fields, value);

    for (const fieldPath of Object.keys(allSerializedValues)) {
      const { controller } = fields[fieldPath];
      const serialized = allSerializedValues[fieldPath];
      // we check the serialized values against the default values on the controller
      if (!isDeepEqual(serialized, controller.serialize(controller.defaultValue))) {
        // if they're different add them to the data object.
        Object.assign(data, serialized);
      }
    }

    try {
      await createFirstItem({
        variables: {
          data,
        },
      });
    } catch (e) {
      console.error(e);
      return;
    }

    await reinitContext();

    if (enableWelcome) return setMode('welcome');
    router.push(redirect);
  };

  const onComplete = () => {
    router.push(redirect);
  };

  return mode === 'init' ? (
    <SigninContainer title="Welcome to KeystoneJS">
      <H1>Welcome to KeystoneJS</H1>
      <p>Create your first user to get started</p>
      <form onSubmit={onSubmit}>
        <Stack gap="large">
          {error && (
            <GraphQLErrorNotice errors={error?.graphQLErrors} networkError={error?.networkError} />
          )}
          <Fields
            fields={fields}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            onChange={setValue}
            value={value}
          />
          <Button
            isLoading={
              loading ||
              data?.authenticate?.__typename === `${listKey}AuthenticationWithPasswordSuccess`
            }
            type="submit"
            weight="bold"
            tone="active"
          >
            Get started
          </Button>
        </Stack>
      </form>
    </SigninContainer>
  ) : (
    <SigninContainer>
      <Welcome value={value} onContinue={onComplete} />
    </SigninContainer>
  );
}

export const getInitPage = (props: InitPageProps) => () => <InitPage {...props} />;
