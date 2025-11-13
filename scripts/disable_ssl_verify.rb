# Disable SSL verification for Jekyll remote theme downloads
# This is needed when SSL certificates have CRL issues

require 'openssl'

module DisableSSLVerify
  def self.disable!
    # Monkey patch Net::HTTP to disable SSL verification
    Net::HTTP.class_eval do
      alias_method :original_use_ssl=, :use_ssl=

      def use_ssl=(flag)
        self.original_use_ssl = flag
        if flag
          self.verify_mode = OpenSSL::SSL::VERIFY_NONE
        end
      end
    end
  end
end

# Apply the patch when Jekyll loads
Jekyll::Hooks.register :site, :after_init do |site|
  DisableSSLVerify.disable!
  Jekyll.logger.warn "SSL verification disabled for remote theme downloads"
end
