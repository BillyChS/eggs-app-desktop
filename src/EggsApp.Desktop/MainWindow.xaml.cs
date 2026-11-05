using System.ComponentModel;
using System.Windows;
using EggsApp.Api.Hosting;
using Microsoft.Web.WebView2.Core;

namespace EggsApp.Desktop;

public partial class MainWindow : Window
{
    private readonly FailureLog _log;
    private Uri? _appUrl;
    private bool _uiShown;
    private bool _hasUnsavedChanges;

    public MainWindow(FailureLog log)
    {
        _log = log;
        InitializeComponent();
        OpeningText.Text = UiText.Opening;
    }

    public async Task LoadAppAsync(Uri appUrl, string userDataFolder)
    {
        _appUrl = appUrl;

        // Keeps the date field and its calendar in Spanish whatever language Windows is in.
        var options = new CoreWebView2EnvironmentOptions { Language = "es-CR" };
        var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder, options: options);
        await Browser.EnsureCoreWebView2Async(environment);

        var browser = Browser.CoreWebView2;
        ApplySettings(browser.Settings);

        browser.NavigationStarting += OnNavigationStarting;
        browser.NewWindowRequested += OnNewWindowRequested;
        browser.NavigationCompleted += OnNavigationCompleted;
        browser.ProcessFailed += OnProcessFailed;
        browser.WebMessageReceived += OnWebMessageReceived;

        browser.Navigate(appUrl.ToString());
    }

    /// <summary>For closing that isn't the user's choice, like a failure or Windows shutting down: nobody gets asked.</summary>
    public void CloseWithoutAsking() => _hasUnsavedChanges = false;

    protected override void OnClosing(CancelEventArgs e)
    {
        if (_hasUnsavedChanges && !FailureDialog.Confirm(UiText.CloseWithUnsavedChanges, noIsSafe: true))
        {
            e.Cancel = true;
        }

        base.OnClosing(e);
    }

    public void BringToFront()
    {
        if (WindowState == WindowState.Minimized)
        {
            WindowState = WindowState.Maximized;
        }

        Activate();

        // Raises the window even if Windows refuses to give it the foreground.
        Topmost = true;
        Topmost = false;
    }

    private static void ApplySettings(CoreWebView2Settings settings)
    {
#if !DEBUG
        // Hides the browser feel. Debug keeps the defaults, including dev tools.
        settings.AreDefaultContextMenusEnabled = false;
        settings.AreDevToolsEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = false;
        settings.IsZoomControlEnabled = false;
        settings.IsPinchZoomEnabled = false;
        settings.IsStatusBarEnabled = false;
        settings.IsSwipeNavigationEnabled = false;
        settings.IsGeneralAutofillEnabled = false;
        settings.IsPasswordAutosaveEnabled = false;
#endif
    }

    private bool IsAppUrl(string url) =>
        _appUrl is not null
        && Uri.TryCreate(url, UriKind.Absolute, out var uri)
        && Uri.Compare(uri, _appUrl, UriComponents.SchemeAndServer, UriFormat.Unescaped, StringComparison.OrdinalIgnoreCase) == 0;

    // The app is the only thing this window ever shows: a stray link must not turn it into a browser.
    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!IsAppUrl(e.Uri))
        {
            e.Cancel = true;
            return;
        }

        // A whole new page, like a reload: whatever was being typed is already gone.
        _hasUnsavedChanges = false;
    }

    // The page says when closing would lose something. See services/desktopShell.ts.
    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!IsAppUrl(e.Source))
        {
            return;
        }

        switch (e.TryGetWebMessageAsString())
        {
            case "unsaved-changes":
                _hasUnsavedChanges = true;
                break;

            case "no-unsaved-changes":
                _hasUnsavedChanges = false;
                break;
        }
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e) => e.Handled = true;

    private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        var loaded = e.IsSuccess && e.HttpStatusCode < 400;

        if (loaded && !_uiShown)
        {
            _uiShown = true;
            OpeningText.Visibility = Visibility.Collapsed;
            Browser.Visibility = Visibility.Visible;
            Browser.Focus();
        }
        else if (!loaded && !_uiShown && e.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled)
        {
            _log.Write("Desktop", $"The UI failed to load: {e.WebErrorStatus}, HTTP {e.HttpStatusCode}.");
            Dispatcher.BeginInvoke(() => ExitWithMessage(UiText.StartFailed));
        }
    }

    private void OnProcessFailed(object? sender, CoreWebView2ProcessFailedEventArgs e)
    {
        _log.Write("Desktop", $"WebView2 process failed: {e.ProcessFailedKind}, {e.Reason}, exit code {e.ExitCode}.");

        // Other kinds (GPU, utility, frames) recover on their own. Dialogs wait until this handler has returned.
        switch (e.ProcessFailedKind)
        {
            case CoreWebView2ProcessFailedKind.BrowserProcessExited:
                Dispatcher.BeginInvoke(() => ExitWithMessage(UiText.BrowserClosed));
                break;

            case CoreWebView2ProcessFailedKind.RenderProcessExited:
            case CoreWebView2ProcessFailedKind.RenderProcessUnresponsive:
                Dispatcher.BeginInvoke(OfferReload);
                break;
        }
    }

    private void OfferReload()
    {
        if (FailureDialog.Confirm(UiText.ReloadPrompt))
        {
            Browser.CoreWebView2?.Reload();
        }
    }

    private void ExitWithMessage(string message)
    {
        CloseWithoutAsking();
        FailureDialog.ShowMessage(message);
        Application.Current.Shutdown(1);
    }
}
