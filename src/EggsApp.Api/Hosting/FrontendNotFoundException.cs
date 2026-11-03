namespace EggsApp.Api.Hosting;

/// <summary>
/// The built React app is missing, so starting the host would only give the user a blank page.
/// </summary>
public sealed class FrontendNotFoundException(string webRoot)
    : Exception($"No index.html found in web root '{webRoot}'.");
