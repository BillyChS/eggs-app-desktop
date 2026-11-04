namespace EggsApp.Desktop;

/// <summary>
/// Spanish text shown by the desktop shell. The React app has its own.
/// </summary>
internal static class UiText
{
    public const string StartFailed =
        "No se pudo abrir Eggs App.\n\n"
        + "Cierre este mensaje e intente abrirla de nuevo. Si vuelve a pasar, por favor llame a Billy.";

    public const string FrontendMissing =
        "No se pudo abrir Eggs App porque hay un problema con la instalación.\n\nPor favor llame a Billy.";

    public const string FrontendMissingInDebug =
        "Falta la interfaz compilada.\n\nEjecute \"pnpm build\" en src/web y vuelva a abrir la aplicación.";

    // Says "no data was deleted" rather than "your data is safe": this also fires for a damaged database file.
    public const string DatabaseFailed =
        "No se pudo abrir Eggs App.\n\nNo se borró ningún dato. Por favor llame a Billy.";

    public const string WebView2Missing =
        "No se pudo abrir Eggs App porque falta un programa en la computadora.\n\nPor favor llame a Billy.";

    public const string UnexpectedError =
        "Ocurrió un problema y Eggs App se va a cerrar.\n\n"
        + "Vuelva a abrirla y revise que lo último que anotó esté guardado. Si vuelve a pasar, por favor llame a Billy.";

    public const string BrowserClosed =
        "La pantalla de Eggs App se cerró y la aplicación se va a cerrar.\n\n"
        + "Vuelva a abrirla y revise que lo último que anotó esté guardado. Si vuelve a pasar, por favor llame a Billy.";

    public const string ReloadPrompt =
        "La pantalla de Eggs App dejó de responder.\n\n"
        + "¿Quiere que la abra de nuevo? Lo último que estaba anotando se puede perder.";

    public const string LogFolderHint =
        "Si Billy se lo pide, los detalles están en esta carpeta:";

    public const string Accept = "Aceptar";
    public const string Yes = "Sí";
    public const string No = "No";
    public const string Opening = "Abriendo…";
}
