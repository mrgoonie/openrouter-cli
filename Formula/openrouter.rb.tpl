class Openrouter < Formula
  desc "Agent + human friendly CLI for the OpenRouter API"
  homepage "https://github.com/openrouter/openrouter-cli"
  version "#{VERSION}"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/openrouter/openrouter-cli/releases/download/v#{VERSION}/openrouter-darwin-arm64"
      sha256 "#{SHA256_DARWIN_ARM64}"

      def install
        bin.install "openrouter-darwin-arm64" => "openrouter"
      end
    end

    on_intel do
      url "https://github.com/openrouter/openrouter-cli/releases/download/v#{VERSION}/openrouter-darwin-x64"
      sha256 "#{SHA256_DARWIN_X64}"

      def install
        bin.install "openrouter-darwin-x64" => "openrouter"
      end
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/openrouter/openrouter-cli/releases/download/v#{VERSION}/openrouter-linux-arm64"
      sha256 "#{SHA256_LINUX_ARM64}"

      def install
        bin.install "openrouter-linux-arm64" => "openrouter"
      end
    end

    on_intel do
      url "https://github.com/openrouter/openrouter-cli/releases/download/v#{VERSION}/openrouter-linux-x64"
      sha256 "#{SHA256_LINUX_X64}"

      def install
        bin.install "openrouter-linux-x64" => "openrouter"
      end
    end
  end

  test do
    assert_match "openrouter v#{VERSION}", shell_output("#{bin}/openrouter --version")
  end
end
