export const GET_LOCAL_PLAYER_HTML = `
<html>
  <body>
    <p>This function gets the player element of the client running the current script.</p>
    <p>You should use predefined variable <b>localPlayer</b> instead of typing getLocalPlayer().</p>

    <h2>Syntax</h2>
    <pre>player getLocalPlayer ( )</pre>

    <h3>Returns</h3>
    <p>Returns the local player element.</p>

    <h2>Example</h2>
    <pre class="prettyprint lang-lua">function outputLocalPlayerPosition()\n  local px, py, pz = getElementPosition(localPlayer)\n  outputConsole("Your location: "..px.." "..py.." "..pz)\nend</pre>
    <syntaxhighlight lang="lua">addEventHandler("onClientPlayerDamage", localPlayer, function()\n  fadeCamera(false, 1.0, 255, 0, 0)\n  setTimer(fadeCamera, 500, 1, true, 1.0)\nend)</syntaxhighlight>

    <h2>See Also</h2>
    <li><a href="/wiki/GetPlayerMapOpacity" title="GetPlayerMapOpacity">GetPlayerMapOpacity</a></li>
    <li><a href="/wiki/GetPlayerMapBoundingBox" title="GetPlayerMapBoundingBox">GetPlayerMapBoundingBox</a></li>
    <li><a href="/wiki/Category:Client_functions" title="Category:Client_functions">Category:Client_functions</a></li>
  </body>
</html>
`;

export const GET_ROOT_ELEMENT_HTML = `
<html>
  <body>
    <p>This function returns the root node of the element tree.</p>
    <p>By default, predefined variable 'root' is getRootElement()</p>

    <h2>Syntax</h2>
    <pre>element getRootElement ( )</pre>

    <h3>Returns</h3>
    <p>Returns the root element.</p>

    <h2>Example</h2>
    <pre class="prettyprint lang-lua">local rootChildren = getElementChildren(root)\noutputChatBox("Loaded elements: " .. #rootChildren)</pre>

    <h2>See Also</h2>
    <li><a href="/wiki/CreateElement" title="CreateElement">CreateElement</a></li>
    <li><a href="/wiki/DestroyElement" title="DestroyElement">DestroyElement</a></li>
  </body>
</html>
`;

export const GET_RESOURCE_ROOT_ELEMENT_HTML = `
<html>
  <body>
    <p>This function retrieves a resource's root element.</p>
    <p>Note: every resource has a predefined global variable called resourceRoot.</p>

    <h2>Syntax</h2>
    <pre>element getResourceRootElement ( [resource theResource=getThisResource()] )</pre>

    <h3>Optional Arguments</h3>
    <p>theResource: the resource whose root element we are getting.</p>

    <h3>Returns</h3>
    <p>Returns an element representing the resource's root, false if it doesn't exist.</p>

    <h2>Example</h2>
    <pre class="prettyprint lang-lua">resourceRoot = getResourceRootElement()\naddEventHandler("onResourceStart", resourceRoot, function()\n  outputChatBox("started")\nend)</pre>

    <h2>See Also</h2>
    <li><a href="/wiki/GetThisResource" title="GetThisResource">GetThisResource</a></li>
    <li><a href="/wiki/GetResourceName" title="GetResourceName">GetResourceName</a></li>
  </body>
</html>
`;

export const LEGACY_ARGUMENTS_HTML = `
<html>
  <body>
    <p>Legacy page for parser fallback checks.</p>
    === Arguments ===
    <pre>string query, int timeout</pre>
    === Returns ===
    <pre>bool success</pre>
    <h2>Syntax</h2>
    <pre>bool doLegacyThing ( string query )</pre>
  </body>
</html>
`;
