/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

// Separate test APK: synthetic inputs only.
require('./src/walkthroughRuntime').enableWalkthrough();

AppRegistry.registerComponent(appName, () => App);
